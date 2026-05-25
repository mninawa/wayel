using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelInvoiceDocument
{
    public ParcelInvoiceId Id { get; set; }
    public ParcelId ParcelId { get; set; }
    public UserId UserId { get; set; }
    public string FileName { get; set; } = "";
    public long FileSizeBytes { get; set; }
    public string? StorageKey { get; set; }
    public string? ContentType { get; set; }
    public InvoiceVerificationStatus Status { get; set; }
    public DateTime UploadedAtUtc { get; set; }

    public static ParcelInvoiceDocument From(ParcelInvoice i) => new()
    {
        Id = i.Id,
        ParcelId = i.ParcelId,
        UserId = i.UserId,
        FileName = i.FileName,
        FileSizeBytes = i.FileSizeBytes,
        StorageKey = i.StorageKey,
        ContentType = i.ContentType,
        Status = i.Status,
        UploadedAtUtc = i.UploadedAtUtc,
    };

    public ParcelInvoice ToDomain() =>
        ParcelInvoice.Rehydrate(Id, ParcelId, UserId, FileName, FileSizeBytes, StorageKey, ContentType, Status, UploadedAtUtc);
}
