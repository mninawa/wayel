using Wayel.Domain.Parcels;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelOpsPhotoDocument
{
    public Guid Id { get; set; }
    public ParcelId ParcelId { get; set; }
    public string Category { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string StorageKey { get; set; } = "";
    public DateTime UploadedAtUtc { get; set; }
    public string? UploadedBy { get; set; }
}
