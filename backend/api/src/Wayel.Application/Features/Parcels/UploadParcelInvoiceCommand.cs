using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record UploadParcelInvoiceCommand(
    Guid ParcelId,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    Stream FileContent) : ICommand<UploadParcelInvoiceResultDto>;

internal sealed class UploadParcelInvoiceCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    ISuiteSubscriptionRepository subscriptions,
    IInvoiceBlobStorage storage,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<UploadParcelInvoiceCommand, UploadParcelInvoiceResultDto>
{
    private const long MaxBytes = 25 * 1024 * 1024;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    };

    public async Task<Result<UploadParcelInvoiceResultDto>> Handle(
        UploadParcelInvoiceCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
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

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        if (!caps.CanUploadInvoices)
        {
            return Error.Validation("suite.invoice_locked", caps.CustomerMessage);
        }

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null || parcel.UserId != user.Id)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var existing = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);

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

        var suiteNumber = subscription?.SuiteNumber?.Trim();
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            suiteNumber = parcel.SuiteNumber?.Trim();
        }

        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            return Error.Validation("suite.missing", "Suite number is required before uploading invoices.");
        }

        var storageKey = ParcelInvoiceStoragePaths.BuildStorageKey(suiteNumber, parcel.Id.Value, ext);
        await storage.PutAsync(storageKey, request.FileContent, request.ContentType, cancellationToken);

        ParcelInvoice invoice;
        if (existing is null)
        {
            invoice = ParcelInvoice.Upload(
                parcel.Id,
                user.Id,
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

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var downloadUrl = $"/api/v1/borderbox/parcels/{parcel.Id.Value}/invoice/download";

        return new UploadParcelInvoiceResultDto(
            parcel.Id.Value,
            "Uploaded",
            invoice.FileName,
            invoice.UploadedAtUtc,
            downloadUrl);
    }
}
