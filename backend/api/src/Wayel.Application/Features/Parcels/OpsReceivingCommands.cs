using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Application.Abstractions.Storage;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record ListOpsExceptionsQuery(int Page = 1, int PageSize = OpsListPagination.DefaultPageSize)
    : IQuery<OpsPagedResult<OpsExceptionItemDto>>;

internal sealed class ListOpsExceptionsQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsExceptionRepository exceptionWorkflows,
    IUserRepository users,
    IClock clock) : IQueryHandler<ListOpsExceptionsQuery, OpsPagedResult<OpsExceptionItemDto>>
{
    public async Task<Result<OpsPagedResult<OpsExceptionItemDto>>> Handle(
        ListOpsExceptionsQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var all = await OpsReceivingExceptionScanner.ScanAllAsync(
            parcels,
            invoices,
            opsMetadata,
            exceptionWorkflows,
            users,
            clock,
            cancellationToken);
        var list = all.ToList();
        var slice = list
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();
        return new OpsPagedResult<OpsExceptionItemDto>(slice, list.Count, page, pageSize);
    }
}

public sealed record ListOpsReadyForQuoteQuery(int Page = 1, int PageSize = OpsListPagination.DefaultPageSize)
    : IQuery<OpsPagedResult<OpsReadyForQuoteItemDto>>;

internal sealed class ListOpsReadyForQuoteQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IUserRepository users) : IQueryHandler<ListOpsReadyForQuoteQuery, OpsPagedResult<OpsReadyForQuoteItemDto>>
{
    public async Task<Result<OpsPagedResult<OpsReadyForQuoteItemDto>>> Handle(
        ListOpsReadyForQuoteQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var all = await BuildAllAsync(cancellationToken);
        var slice = all
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();
        return new OpsPagedResult<OpsReadyForQuoteItemDto>(slice, all.Count, page, pageSize);
    }

    private async Task<List<OpsReadyForQuoteItemDto>> BuildAllAsync(CancellationToken cancellationToken)
    {
        var result = new List<OpsReadyForQuoteItemDto>();
        const int batchSize = 100;
        var offset = 0;

        while (true)
        {
            var batch = await parcels.ListRecentPageAsync(offset, batchSize, cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            foreach (var parcel in batch)
            {
                var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
                var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
                var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
                if (readiness.State is not ("READY" or "SENT_TO_QUOTE_QUEUE") &&
                    parcel.Status != ParcelStatus.ReadyToShip)
                {
                    continue;
                }

                var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
                result.Add(new OpsReadyForQuoteItemDto(
                    parcel.Id.Value,
                    OpsParcelDisplayIds.Format(parcel),
                    user?.DisplayName ?? "Customer",
                    parcel.SuiteNumber,
                    parcel.Retailer,
                    parcel.ItemName,
                    parcel.WeightKg,
                    parcel.DeclaredValueZar,
                    OpsInvoiceStatusLabel(invoice, parcel),
                    meta?.ConditionStatus ?? "NOT_INSPECTED",
                    readiness.State,
                    parcel.ReceivedAtUtc));
            }

            offset += batch.Count;
            if (batch.Count < batchSize)
            {
                break;
            }
        }

        return result;
    }

    private static string OpsInvoiceStatusLabel(ParcelInvoice? invoice, Parcel parcel)
    {
        if (invoice is null) return "NOT_UPLOADED";
        return invoice.Status switch
        {
            InvoiceVerificationStatus.Verified => "VERIFIED",
            InvoiceVerificationStatus.Rejected => "REJECTED",
            _ => "UNDER_REVIEW",
        };
    }
}

public sealed record UploadOpsParcelInvoiceCommand(
    Guid ParcelId,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    Stream FileContent) : ICommand<UploadOpsInvoiceResultDto>;

internal sealed class UploadOpsParcelInvoiceCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsActivityRepository activities,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<UploadOpsParcelInvoiceCommand, UploadOpsInvoiceResultDto>
{
    private const long MaxBytes = 25 * 1024 * 1024;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    };

    public async Task<Result<UploadOpsInvoiceResultDto>> Handle(
        UploadOpsParcelInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanUploadInvoice(ops.Role),
            "ops.invoice.forbidden",
            "Your role cannot upload invoice files.");
        if (denied is not null)
        {
            return denied;
        }

        if (string.IsNullOrWhiteSpace(request.FileName)
            || request.FileSizeBytes <= 0
            || request.FileSizeBytes > MaxBytes)
        {
            return Error.Validation("invoice.invalid", "A valid invoice file (max 25 MB) is required.");
        }

        if (!AllowedContentTypes.Contains(request.ContentType))
        {
            return Error.Validation("invoice.type", "Invoice must be PDF or an image (JPEG, PNG, WebP).");
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var suiteNumber = parcel.SuiteNumber?.Trim();
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            return Error.Validation("suite.missing", "Confirm the suite match before uploading an invoice.");
        }

        var existing = await invoices.GetForParcelAsync(parcelId, cancellationToken);

        var ext = Path.GetExtension(request.FileName);
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = request.ContentType switch
            {
                "application/pdf" => ".pdf",
                "image/png" => ".png",
                "image/webp" => ".webp",
                _ => ".jpg",
            };
        }

        var storageKey = ParcelInvoiceStoragePaths.BuildStorageKey(suiteNumber, parcel.Id.Value, ext);
        await storage.PutAsync(storageKey, request.FileContent, request.ContentType, cancellationToken);

        ParcelInvoice invoice;
        if (existing is null)
        {
            invoice = ParcelInvoice.Upload(
                parcel.Id,
                parcel.UserId,
                request.FileName,
                request.FileSizeBytes,
                clock.UtcNow);
            invoice.AttachStorage(storageKey, request.ContentType);
            await invoices.AddAsync(invoice, cancellationToken);
        }
        else
        {
            invoice = existing;
            invoice.ReplaceFile(
                request.FileName,
                request.FileSizeBytes,
                storageKey,
                request.ContentType,
                clock.UtcNow);
            invoice.ResetVerificationPending();
            await invoices.ReplaceAsync(invoice, cancellationToken);
        }

        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "INVOICE_UPLOADED",
            "Invoice uploaded by warehouse",
            request.FileName,
            ops.Actor,
            clock.UtcNow,
            cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new UploadOpsInvoiceResultDto(
            parcel.Id.Value,
            "Uploaded",
            invoice.FileName,
            invoice.UploadedAtUtc,
            "Invoice uploaded for this parcel.");
    }
}

public sealed record VerifyOpsParcelInvoiceCommand(
    Guid ParcelId,
    string Decision,
    string? Reason) : ICommand<VerifyOpsInvoiceResultDto>;

internal sealed class VerifyOpsParcelInvoiceCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsActivityRepository activities,
    IUserRepository users,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxInAppNotifier inApp) : ICommandHandler<VerifyOpsParcelInvoiceCommand, VerifyOpsInvoiceResultDto>
{
    public async Task<Result<VerifyOpsInvoiceResultDto>> Handle(
        VerifyOpsParcelInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanVerifyInvoice(ops.Role),
            "ops.invoice.forbidden",
            "Your role cannot verify invoices.");
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
        if (invoice is null)
        {
            return Error.Validation("invoice.missing", "No invoice uploaded for this parcel.");
        }

        var decision = request.Decision.Trim().ToUpperInvariant();
        if (decision is "APPROVE" or "VERIFIED")
        {
            invoice.MarkVerified();
            if (parcel.Status == ParcelStatus.AwaitingInvoice)
            {
                // stays until full readiness
            }
        }
        else if (decision is "REJECT" or "REJECTED")
        {
            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                return Error.Validation(
                    "invoice.reason_required",
                    "A rejection reason is required so the customer can be notified.");
            }

            invoice.MarkRejected();
        }
        else
        {
            return Error.Validation("invoice.invalid_decision", "Decision must be APPROVE or REJECT.");
        }

        await invoices.ReplaceAsync(invoice, cancellationToken);
        var now = clock.UtcNow;
        var approved = decision.StartsWith("APPROVE", StringComparison.Ordinal) || decision == "VERIFIED";
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            approved ? "INVOICE_APPROVED" : "INVOICE_REJECTED",
            approved ? "Invoice approved" : "Invoice rejected",
            request.Reason,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        if (!approved)
        {
            var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
            if (user is not null)
            {
                await whatsApp.NotifyInvoiceRejectedAsync(
                    user,
                    parcel.Id.Value,
                    parcel.SuiteNumber,
                    parcel.ItemName,
                    request.Reason,
                    cancellationToken);

                await inApp.NotifyInvoiceRejectedAsync(
                    user,
                    parcel.Id.Value,
                    parcel.SuiteNumber,
                    parcel.ItemName,
                    request.Reason,
                    cancellationToken);
            }
        }

        var meta = await opsMetadata.GetForParcelAsync(parcelId, cancellationToken);
        var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
        return new VerifyOpsInvoiceResultDto(
            parcel.Id.Value,
            invoice.Status.ToString().ToUpperInvariant(),
            readiness.State,
            approved
                ? "Invoice verified."
                : "Invoice rejected.");
    }
}

public sealed record SaveOpsParcelInspectionCommand(
    Guid ParcelId,
    string ConditionStatus,
    string? WarehouseLocation,
    string? PackagingType,
    bool OuterPackagingIntact,
    bool SealIntact,
    bool LabelReadable,
    bool GoodsAsDescribed,
    string? InspectionNotes,
    string? InspectedBy) : ICommand<SaveOpsInspectionResultDto>;

internal sealed class SaveOpsParcelInspectionCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsPhotoRepository photos,
    IParcelOpsActivityRepository activities,
    IUserRepository users,
    IInvoiceBlobStorage storage,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork,
    ICustomerWhatsAppMessageLogRepository whatsAppMessageLog,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxInAppNotifier inApp) : ICommandHandler<SaveOpsParcelInspectionCommand, SaveOpsInspectionResultDto>
{
    public async Task<Result<SaveOpsInspectionResultDto>> Handle(
        SaveOpsParcelInspectionCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanInspect(ops.Role),
            "ops.inspect.forbidden",
            "Your role cannot save inspections.");
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

        var now = clock.UtcNow;
        var metadata = new ParcelOpsMetadata(
            parcelId,
            string.IsNullOrWhiteSpace(request.WarehouseLocation) ? null : request.WarehouseLocation.Trim(),
            string.IsNullOrWhiteSpace(request.ConditionStatus) ? "GOOD" : request.ConditionStatus.Trim().ToUpperInvariant(),
            string.IsNullOrWhiteSpace(request.InspectionNotes) ? null : request.InspectionNotes.Trim(),
            string.IsNullOrWhiteSpace(request.PackagingType) ? null : request.PackagingType.Trim(),
            request.OuterPackagingIntact,
            request.SealIntact,
            request.LabelReadable,
            request.GoodsAsDescribed,
            now,
            string.IsNullOrWhiteSpace(request.InspectedBy) ? "Ops User" : request.InspectedBy.Trim(),
            now);

        await opsMetadata.UpsertAsync(metadata, cancellationToken);
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "INSPECTION_SAVED",
            $"Inspection · {metadata.ConditionStatus}",
            metadata.InspectionNotes,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        ParcelInvoiceUploadReminder.Result reminder = new("NotSent", null);
        if (user is not null)
        {
            var inspectionPhotos = await photos.ListForParcelAsync(parcelId, "INSPECTION", cancellationToken);
            var imageUrls = new List<string>(inspectionPhotos.Count);
            foreach (var photo in inspectionPhotos)
            {
                var uri = await storage.GetDownloadUriAsync(photo.StorageKey, cancellationToken);
                if (uri is not null)
                {
                    imageUrls.Add(uri.ToString());
                }
            }

            await whatsApp.NotifyInspectionSavedAsync(
                user,
                parcel.Id.Value,
                parcel.SuiteNumber,
                parcel.ItemName,
                metadata.ConditionStatus,
                metadata.InspectionNotes,
                imageUrls,
                cancellationToken);

            await inApp.NotifyInspectionSavedAsync(
                user,
                parcel.Id.Value,
                parcel.SuiteNumber,
                parcel.ItemName,
                metadata.ConditionStatus,
                cancellationToken);

            reminder = await ParcelInvoiceUploadReminder.SendIfNeededAsync(
                whatsAppMessageLog,
                invoices,
                whatsApp,
                inApp,
                user,
                parcel,
                cancellationToken);
        }

        var invoice = await invoices.GetForParcelAsync(parcelId, cancellationToken);
        var readiness = OpsReadinessRules.Evaluate(parcel, invoice, metadata);
        return new SaveOpsInspectionResultDto(
            parcel.Id.Value,
            metadata.ConditionStatus,
            readiness.State,
            now,
            reminder.Status,
            reminder.Detail);
    }
}

public sealed record SendOpsParcelsToQuoteQueueCommand(IReadOnlyList<Guid> ParcelIds)
    : ICommand<SendToQuoteQueueResultDto>;

internal sealed class SendOpsParcelsToQuoteQueueCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsActivityRepository activities,
    IUserRepository users,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxInAppNotifier inApp,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<SendOpsParcelsToQuoteQueueCommand, SendToQuoteQueueResultDto>
{
    public async Task<Result<SendToQuoteQueueResultDto>> Handle(
        SendOpsParcelsToQuoteQueueCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanSendToQuote(ops.Role),
            "ops.quote.forbidden",
            "Your role cannot send parcels to the quote queue.");
        if (denied is not null)
        {
            return denied;
        }

        if (request.ParcelIds.Count == 0)
        {
            return Error.Validation("quote.no_parcels", "Select at least one parcel.");
        }

        var sent = new List<Guid>();
        foreach (var id in request.ParcelIds.Distinct())
        {
            var parcelId = new ParcelId(id);
            var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
            if (parcel is null)
            {
                continue;
            }

            var invoice = await invoices.GetForParcelAsync(parcelId, cancellationToken);
            var meta = await opsMetadata.GetForParcelAsync(parcelId, cancellationToken);
            var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
            if (readiness.State != "READY" && parcel.Status != ParcelStatus.ReadyToShip)
            {
                return Error.Validation(
                    "quote.not_ready",
                    $"Parcel {OpsParcelDisplayIds.Format(parcel)} is not ready: {readiness.BlockersSummary}");
            }

            if (readiness.State == "READY")
            {
                var promoted = await OpsQuoteQueuePromoter.TryPromoteAsync(
                    parcel,
                    invoice,
                    meta,
                    parcels,
                    activities,
                    users,
                    whatsApp,
                    inApp,
                    clock,
                    ops.Actor,
                    cancellationToken);
                if (promoted)
                {
                    sent.Add(id);
                }

                continue;
            }

            if (parcel.Status == ParcelStatus.ReadyToShip)
            {
                sent.Add(id);
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new SendToQuoteQueueResultDto(sent, sent.Count, $"{sent.Count} parcel(s) sent to quote queue.");
    }
}

internal static class OpsExceptionRules
{
    internal sealed record DetectedException(string Type, string Severity, string Status);

    internal static string DetectSeverity(string exceptionType) =>
        exceptionType.ToUpperInvariant() switch
        {
            "UNIDENTIFIED" => "HIGH",
            "DAMAGED" => "HIGH",
            "MISSING_INVOICE" => "MEDIUM",
            _ => "LOW",
        };

    internal static IReadOnlyList<DetectedException> Detect(
        Parcel parcel,
        ParcelInvoice? invoice,
        ParcelOpsMetadata? meta)
    {
        var list = new List<DetectedException>();
        if (string.IsNullOrWhiteSpace(parcel.SuiteNumber))
        {
            list.Add(new("UNIDENTIFIED", "HIGH", "NEW"));
        }
        else if (string.IsNullOrWhiteSpace(parcel.TrackingNumber))
        {
            list.Add(new("UNIDENTIFIED", "MEDIUM", "NEW"));
        }

        if (invoice is null || invoice.Status != InvoiceVerificationStatus.Verified)
        {
            if (parcel.Status == ParcelStatus.AwaitingInvoice || invoice is null)
            {
                list.Add(new("MISSING_INVOICE", "MEDIUM", "NEW"));
            }
            else if (invoice.Status == InvoiceVerificationStatus.Pending)
            {
                list.Add(new("MISSING_INVOICE", "LOW", "IN_PROGRESS"));
            }
            else if (invoice.Status == InvoiceVerificationStatus.Rejected)
            {
                list.Add(new("MISSING_INVOICE", "HIGH", "PENDING_INFO"));
            }
        }

        if (meta?.ConditionStatus is "MINOR_DAMAGE" or "MAJOR_DAMAGE")
        {
            list.Add(new("DAMAGED", meta.ConditionStatus == "MAJOR_DAMAGE" ? "HIGH" : "MEDIUM", "IN_PROGRESS"));
        }

        return list;
    }
}

internal static class OpsReadinessRules
{
    internal sealed record ReadinessResult(string State, string BlockersSummary);

    internal static ReadinessResult Evaluate(Parcel parcel, ParcelInvoice? invoice, ParcelOpsMetadata? meta)
    {
        var blockers = new List<string>();
        if (string.IsNullOrWhiteSpace(parcel.SuiteNumber))
        {
            blockers.Add("customer match");
        }

        if (parcel.WeightKg is null or <= 0)
        {
            blockers.Add("weight");
        }

        if (string.IsNullOrWhiteSpace(parcel.DimensionsLabel))
        {
            blockers.Add("dimensions");
        }

        if (meta is null || meta.ConditionStatus == "NOT_INSPECTED")
        {
            blockers.Add("inspection");
        }

        if (invoice is null || invoice.Status != InvoiceVerificationStatus.Verified)
        {
            blockers.Add("invoice");
        }

        if (parcel.DeclaredValueZar is null or <= 0)
        {
            blockers.Add("declared value");
        }

        if (meta is null || (string.IsNullOrWhiteSpace(meta.LocationId) && string.IsNullOrWhiteSpace(meta.WarehouseLocation)))
        {
            blockers.Add("storage location");
        }

        if (parcel.Status == ParcelStatus.ReadyToShip)
        {
            return new("SENT_TO_QUOTE_QUEUE", "");
        }

        if (blockers.Count == 0)
        {
            return new("READY", "");
        }

        return new("NOT_READY", string.Join(", ", blockers));
    }
}

public sealed record SendParcelInvoiceUploadReminderCommand(
    Guid ParcelId,
    bool ForceResend = false) : ICommand<SendParcelInvoiceUploadReminderResultDto>;

public sealed record SendParcelInvoiceUploadReminderResultDto(
    Guid ParcelId,
    string InvoiceReminderWhatsAppStatus,
    string? InvoiceReminderWhatsAppDetail,
    string Message);

internal sealed class SendParcelInvoiceUploadReminderCommandHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IUserRepository users,
    ICustomerWhatsAppMessageLogRepository whatsAppMessageLog,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxInAppNotifier inApp) : ICommandHandler<SendParcelInvoiceUploadReminderCommand, SendParcelInvoiceUploadReminderResultDto>
{
    public async Task<Result<SendParcelInvoiceUploadReminderResultDto>> Handle(
        SendParcelInvoiceUploadReminderCommand request,
        CancellationToken cancellationToken)
    {
        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(parcel.UserId);
        }

        var reminder = await ParcelInvoiceUploadReminder.SendIfNeededAsync(
            whatsAppMessageLog,
            invoices,
            whatsApp,
            inApp,
            user,
            parcel,
            cancellationToken,
            request.ForceResend);

        var message = reminder.Status switch
        {
            "Sent" => "WhatsApp invoice upload reminder sent to the customer.",
            "AlreadySent" => "Invoice upload reminder was already sent for this parcel.",
            "NotNeeded" => "Invoice is already on file — no reminder needed.",
            "Skipped" => reminder.Detail ?? "WhatsApp reminder was not sent.",
            "Failed" => reminder.Detail ?? "WhatsApp reminder failed to send.",
            _ => "Invoice upload reminder processed.",
        };

        return new SendParcelInvoiceUploadReminderResultDto(
            parcel.Id.Value,
            reminder.Status,
            reminder.Detail,
            message);
    }
}
