using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record ListOpsParcelActivityQuery(Guid ParcelId, int Limit = 50)
    : IQuery<IReadOnlyList<OpsActivityItemDto>>;

internal sealed class ListOpsParcelActivityQueryHandler(
    IParcelRepository parcels,
    IParcelOpsActivityRepository activities) : IQueryHandler<ListOpsParcelActivityQuery, IReadOnlyList<OpsActivityItemDto>>
{
    public async Task<Result<IReadOnlyList<OpsActivityItemDto>>> Handle(
        ListOpsParcelActivityQuery request,
        CancellationToken cancellationToken)
    {
        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var events = await activities.ListForParcelAsync(parcelId, request.Limit, cancellationToken);
        if (events.Count == 0)
        {
            IReadOnlyList<OpsActivityItemDto> seeded =
            [
                new OpsActivityItemDto(
                    Guid.Empty,
                    "PARCEL_RECEIVED",
                    "Parcel received at warehouse",
                    $"{parcel.Retailer} · {parcel.ItemName}",
                    null,
                    parcel.ReceivedAtUtc),
            ];
            return Result.Success(seeded);
        }

        IReadOnlyList<OpsActivityItemDto> mapped = events.Select(e => new OpsActivityItemDto(
            e.Id,
            e.EventType,
            e.Title,
            e.Detail,
            e.Actor,
            e.OccurredAtUtc)).ToList();
        return Result.Success(mapped);
    }
}

public sealed record DownloadOpsParcelInvoiceQuery(Guid ParcelId) : IQuery<ParcelInvoiceFileDto>;

internal sealed class DownloadOpsParcelInvoiceQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops) : IQueryHandler<DownloadOpsParcelInvoiceQuery, ParcelInvoiceFileDto>
{
    public async Task<Result<ParcelInvoiceFileDto>> Handle(
        DownloadOpsParcelInvoiceQuery request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanViewInvoice(ops.Role),
            "ops.invoice.forbidden",
            "Your role cannot view invoice files.");
        if (denied is not null)
        {
            return denied;
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var invoice = await invoices.GetForParcelAsync(parcelId, cancellationToken);
        if (invoice is null || string.IsNullOrWhiteSpace(invoice.StorageKey))
        {
            return Error.NotFound("invoice.not_found", "No invoice file for this parcel.");
        }

        var stream = await storage.OpenReadAsync(invoice.StorageKey, cancellationToken);
        if (stream is null)
        {
            return Error.NotFound("invoice.file_missing", "Invoice file is not available.");
        }

        return new ParcelInvoiceFileDto(
            invoice.FileName,
            invoice.ContentType ?? "application/pdf",
            stream,
            null);
    }
}

public sealed record CreateOpsParcelPhotoUploadTicketCommand(
    Guid ParcelId,
    string Category,
    string FileName,
    string ContentType,
    long SizeBytes) : ICommand<OpsPhotoUploadTicketDto>;

internal sealed class CreateOpsParcelPhotoUploadTicketCommandHandler(
    IParcelRepository parcels,
    IInvoiceBlobStorage storage,
    IOpsPhotoUploadSessionStore sessions,
    IOpsCallerContext ops) : ICommandHandler<CreateOpsParcelPhotoUploadTicketCommand, OpsPhotoUploadTicketDto>
{
    public async Task<Result<OpsPhotoUploadTicketDto>> Handle(
        CreateOpsParcelPhotoUploadTicketCommand request,
        CancellationToken cancellationToken)
    {
        var category = OpsParcelPhotoRules.NormalizeCategory(request.Category);
        var denied = OpsPermissions.Require(
            OpsParcelPhotoRules.CanUploadCategory(ops.Role, category),
            "ops.photo.forbidden",
            "Your role cannot upload photos for this step.");
        if (denied is not null)
        {
            return denied;
        }

        if (request.SizeBytes <= 0 || request.SizeBytes > OpsParcelPhotoRules.MaxBytes)
        {
            return Error.Validation("photo.invalid", "Photo must be under 12 MB.");
        }

        var contentType = OpsParcelPhotoRules.NormalizeContentType(request.ContentType, request.FileName);
        if (!OpsParcelPhotoRules.IsAllowedContentType(contentType))
        {
            return Error.Validation("photo.type", "Photo must be JPEG, PNG, or WebP.");
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var photoId = Guid.NewGuid();
        var storageKey = OpsParcelPhotoRules.BuildStorageKey(parcelId.Value, category, photoId, request.FileName);
        var ttl = TimeSpan.FromMinutes(5);
        var ticket = await storage.CreateUploadTicketAsync(
            storageKey,
            contentType,
            request.SizeBytes,
            ttl,
            cancellationToken);

        sessions.Save(new OpsPhotoUploadSession(
            photoId,
            parcelId.Value,
            category,
            request.FileName,
            contentType,
            request.SizeBytes,
            storageKey,
            ops.Actor,
            ticket.ExpiresAtUtc,
            BytesReceived: false));

        return new OpsPhotoUploadTicketDto(photoId, ticket.UploadUrl, ticket.RequiredHeaders, ticket.ExpiresAtUtc);
    }
}

public sealed record ConfirmOpsParcelPhotoUploadCommand(
    Guid ParcelId,
    Guid PhotoId,
    string Category,
    string FileName,
    string ContentType,
    long SizeBytes) : ICommand<OpsPhotoDto>;

internal sealed class ConfirmOpsParcelPhotoUploadCommandHandler(
    IParcelRepository parcels,
    IParcelOpsPhotoRepository photos,
    IParcelOpsActivityRepository activities,
    IInvoiceBlobStorage storage,
    IOpsPhotoUploadSessionStore sessions,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ConfirmOpsParcelPhotoUploadCommand, OpsPhotoDto>
{
    public async Task<Result<OpsPhotoDto>> Handle(
        ConfirmOpsParcelPhotoUploadCommand request,
        CancellationToken cancellationToken)
    {
        var category = OpsParcelPhotoRules.NormalizeCategory(request.Category);
        var denied = OpsPermissions.Require(
            OpsParcelPhotoRules.CanUploadCategory(ops.Role, category),
            "ops.photo.forbidden",
            "Your role cannot upload photos for this step.");
        if (denied is not null)
        {
            return denied;
        }

        var session = sessions.Get(request.PhotoId);
        if (session is null || session.ExpiresAtUtc <= clock.UtcNow)
        {
            return Error.Validation("photo.upload_expired", "Upload session expired. Add the photo again.");
        }

        if (session.ParcelId != request.ParcelId
            || !string.Equals(session.Category, category, StringComparison.Ordinal)
            || !string.Equals(session.StorageKey, OpsParcelPhotoRules.BuildStorageKey(request.ParcelId, category, request.PhotoId, request.FileName), StringComparison.Ordinal))
        {
            return Error.Validation("photo.upload_mismatch", "Upload details do not match the issued ticket.");
        }

        var contentType = OpsParcelPhotoRules.NormalizeContentType(request.ContentType, request.FileName);
        if (!string.Equals(session.ContentType, contentType, StringComparison.OrdinalIgnoreCase)
            || session.SizeBytes != request.SizeBytes)
        {
            return Error.Validation("photo.upload_mismatch", "Upload details do not match the issued ticket.");
        }

        if (!await storage.ExistsAsync(session.StorageKey, session.SizeBytes, cancellationToken))
        {
            return Error.Validation("photo.upload_missing", "Photo bytes were not received. Try uploading again.");
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var now = clock.UtcNow;
        var photo = new ParcelOpsPhoto(
            request.PhotoId,
            parcelId,
            category,
            request.FileName,
            contentType,
            session.StorageKey,
            now,
            ops.Actor);

        await photos.AddAsync(photo, cancellationToken);
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "PHOTO_UPLOADED",
            $"{category} photo uploaded",
            request.FileName,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        sessions.Remove(request.PhotoId);

        return new OpsPhotoDto(request.PhotoId, category, request.FileName, contentType, now, ops.Actor);
    }
}

public sealed record UploadOpsParcelPhotoBytesCommand(Guid PhotoId, Stream FileContent) : ICommand<bool>;

internal sealed class UploadOpsParcelPhotoBytesCommandHandler(
    IInvoiceBlobStorage storage,
    IOpsPhotoUploadSessionStore sessions,
    IOpsCallerContext ops,
    IClock clock) : ICommandHandler<UploadOpsParcelPhotoBytesCommand, bool>
{
    public async Task<Result<bool>> Handle(
        UploadOpsParcelPhotoBytesCommand request,
        CancellationToken cancellationToken)
    {
        var session = sessions.Get(request.PhotoId);
        if (session is null || session.ExpiresAtUtc <= clock.UtcNow)
        {
            return Error.Validation("photo.upload_expired", "Upload session expired. Add the photo again.");
        }

        var denied = OpsPermissions.Require(
            OpsParcelPhotoRules.CanUploadCategory(ops.Role, session.Category),
            "ops.photo.forbidden",
            "Your role cannot upload photos for this step.");
        if (denied is not null)
        {
            return denied;
        }

        await using var buffer = new MemoryStream();
        await request.FileContent.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length != session.SizeBytes)
        {
            return Error.Validation("photo.invalid", "Uploaded file size does not match the issued ticket.");
        }

        buffer.Position = 0;
        await storage.PutAsync(session.StorageKey, buffer, session.ContentType, cancellationToken);
        sessions.MarkBytesReceived(request.PhotoId);
        return true;
    }
}

public sealed record UploadOpsParcelPhotoCommand(
    Guid ParcelId,
    string Category,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    Stream FileContent) : ICommand<OpsPhotoDto>;

internal sealed class UploadOpsParcelPhotoCommandHandler(
    IParcelRepository parcels,
    IParcelOpsPhotoRepository photos,
    IParcelOpsActivityRepository activities,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<UploadOpsParcelPhotoCommand, OpsPhotoDto>
{
    public async Task<Result<OpsPhotoDto>> Handle(
        UploadOpsParcelPhotoCommand request,
        CancellationToken cancellationToken)
    {
        var category = OpsParcelPhotoRules.NormalizeCategory(request.Category);
        var denied = OpsPermissions.Require(
            OpsParcelPhotoRules.CanUploadCategory(ops.Role, category),
            "ops.photo.forbidden",
            "Your role cannot upload photos for this step.");
        if (denied is not null)
        {
            return denied;
        }

        if (request.FileSizeBytes <= 0 || request.FileSizeBytes > OpsParcelPhotoRules.MaxBytes)
        {
            return Error.Validation("photo.invalid", "Photo must be under 12 MB.");
        }

        var contentType = OpsParcelPhotoRules.NormalizeContentType(request.ContentType, request.FileName);
        if (!OpsParcelPhotoRules.IsAllowedContentType(contentType))
        {
            return Error.Validation("photo.type", "Photo must be JPEG, PNG, or WebP.");
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var photoId = Guid.NewGuid();
        var storageKey = OpsParcelPhotoRules.BuildStorageKey(parcelId.Value, category, photoId, request.FileName);
        await storage.PutAsync(storageKey, request.FileContent, contentType, cancellationToken);

        var now = clock.UtcNow;
        var photo = new ParcelOpsPhoto(
            photoId,
            parcelId,
            category,
            request.FileName,
            contentType,
            storageKey,
            now,
            ops.Actor);

        await photos.AddAsync(photo, cancellationToken);
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "PHOTO_UPLOADED",
            $"{category} photo uploaded",
            request.FileName,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsPhotoDto(photoId, category, request.FileName, contentType, now, ops.Actor);
    }
}

public sealed record ListOpsParcelPhotosQuery(Guid ParcelId, string? Category = null)
    : IQuery<IReadOnlyList<OpsPhotoDto>>;

internal sealed class ListOpsParcelPhotosQueryHandler(
    IParcelRepository parcels,
    IParcelOpsPhotoRepository photos) : IQueryHandler<ListOpsParcelPhotosQuery, IReadOnlyList<OpsPhotoDto>>
{
    public async Task<Result<IReadOnlyList<OpsPhotoDto>>> Handle(
        ListOpsParcelPhotosQuery request,
        CancellationToken cancellationToken)
    {
        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var list = await photos.ListForParcelAsync(parcelId, request.Category, cancellationToken);
        return list.Select(p => new OpsPhotoDto(
            p.Id,
            p.Category,
            p.FileName,
            p.ContentType,
            p.UploadedAtUtc,
            p.UploadedBy)).ToList();
    }
}

public sealed record DownloadOpsParcelPhotoQuery(Guid PhotoId) : IQuery<ParcelInvoiceFileDto>;

internal sealed class DownloadOpsParcelPhotoQueryHandler(
    IParcelOpsPhotoRepository photos,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops) : IQueryHandler<DownloadOpsParcelPhotoQuery, ParcelInvoiceFileDto>
{
    public async Task<Result<ParcelInvoiceFileDto>> Handle(
        DownloadOpsParcelPhotoQuery request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanInspect(ops.Role)
            || OpsPermissions.CanIntake(ops.Role)
            || Warehouse.WarehouseOpsPermissions.CanRead(ops.Role),
            "ops.photo.forbidden",
            "Your role cannot view parcel photos.");
        if (denied is not null)
        {
            return denied;
        }

        var photo = await photos.GetByIdAsync(request.PhotoId, cancellationToken);
        if (photo is null)
        {
            return Error.NotFound("photo.not_found", "Photo not found.");
        }

        var stream = await storage.OpenReadAsync(photo.StorageKey, cancellationToken);
        if (stream is null)
        {
            return Error.NotFound("photo.file_missing", "Photo file is not available.");
        }

        return new ParcelInvoiceFileDto(
            photo.FileName,
            photo.ContentType,
            stream,
            null);
    }
}

public sealed record DeleteOpsParcelPhotoCommand(Guid PhotoId) : ICommand<DeleteOpsPhotoResultDto>;

internal sealed class DeleteOpsParcelPhotoCommandHandler(
    IParcelRepository parcels,
    IParcelOpsPhotoRepository photos,
    IParcelOpsActivityRepository activities,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<DeleteOpsParcelPhotoCommand, DeleteOpsPhotoResultDto>
{
    public async Task<Result<DeleteOpsPhotoResultDto>> Handle(
        DeleteOpsParcelPhotoCommand request,
        CancellationToken cancellationToken)
    {
        var photo = await photos.GetByIdAsync(request.PhotoId, cancellationToken);
        if (photo is null)
        {
            return Error.NotFound("photo.not_found", "Photo not found.");
        }

        var denied = OpsPermissions.Require(
            OpsParcelPhotoRules.CanUploadCategory(ops.Role, photo.Category),
            "ops.photo.forbidden",
            "Your role cannot delete photos for this step.");
        if (denied is not null)
        {
            return denied;
        }

        var parcel = await parcels.GetByIdAsync(photo.ParcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        await storage.DeleteAsync(photo.StorageKey, cancellationToken);
        await photos.DeleteAsync(photo.Id, cancellationToken);
        var now = clock.UtcNow;
        await OpsParcelActivityWriter.LogAsync(
            activities,
            photo.ParcelId,
            "PHOTO_DELETED",
            $"{photo.Category} photo removed",
            photo.FileName,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new DeleteOpsPhotoResultDto(photo.Id, "Photo deleted.");
    }
}
