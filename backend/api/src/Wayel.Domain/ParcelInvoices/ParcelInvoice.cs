using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Domain.ParcelInvoices;

public sealed class ParcelInvoice : AggregateRoot<ParcelInvoiceId>
{
    private ParcelInvoice(
        ParcelInvoiceId id,
        ParcelId parcelId,
        UserId userId,
        string fileName,
        long fileSizeBytes,
        string? storageKey,
        string? contentType,
        InvoiceVerificationStatus status,
        DateTime uploadedAtUtc)
        : base(id)
    {
        ParcelId = parcelId;
        UserId = userId;
        FileName = fileName;
        FileSizeBytes = fileSizeBytes;
        StorageKey = storageKey;
        ContentType = contentType;
        Status = status;
        UploadedAtUtc = uploadedAtUtc;
    }

    public ParcelId ParcelId { get; }
    public UserId UserId { get; }
    public string FileName { get; private set; }
    public long FileSizeBytes { get; private set; }
    public string? StorageKey { get; private set; }
    public string? ContentType { get; private set; }
    public InvoiceVerificationStatus Status { get; private set; }
    public DateTime UploadedAtUtc { get; private set; }

    public void AttachStorage(string storageKey, string contentType)
    {
        StorageKey = storageKey;
        ContentType = contentType;
    }

    public Result MarkVerified()
    {
        Status = InvoiceVerificationStatus.Verified;
        return Result.Success();
    }

    public Result MarkRejected()
    {
        Status = InvoiceVerificationStatus.Rejected;
        return Result.Success();
    }

    public void ResetVerificationPending()
    {
        Status = InvoiceVerificationStatus.Pending;
    }

    public void ReplaceFile(
        string fileName,
        long fileSizeBytes,
        string storageKey,
        string contentType,
        DateTime uploadedAtUtc)
    {
        FileName = fileName.Trim();
        FileSizeBytes = fileSizeBytes;
        UploadedAtUtc = uploadedAtUtc;
        AttachStorage(storageKey, contentType);
    }

    public static ParcelInvoice Upload(
        ParcelId parcelId,
        UserId userId,
        string fileName,
        long fileSizeBytes,
        DateTime uploadedAtUtc) =>
        new(
            ParcelInvoiceId.New(),
            parcelId,
            userId,
            fileName.Trim(),
            fileSizeBytes,
            null,
            null,
            InvoiceVerificationStatus.Pending,
            uploadedAtUtc);

    public static ParcelInvoice Rehydrate(
        ParcelInvoiceId id,
        ParcelId parcelId,
        UserId userId,
        string fileName,
        long fileSizeBytes,
        string? storageKey,
        string? contentType,
        InvoiceVerificationStatus status,
        DateTime uploadedAtUtc) =>
        new(id, parcelId, userId, fileName, fileSizeBytes, storageKey, contentType, status, uploadedAtUtc);
}
