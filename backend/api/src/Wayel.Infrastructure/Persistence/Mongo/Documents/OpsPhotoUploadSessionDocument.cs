using MongoDB.Bson.Serialization.Attributes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class OpsPhotoUploadSessionDocument
{
    [BsonId]
    public Guid PhotoId { get; set; }

    public Guid ParcelId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public bool BytesReceived { get; set; }
}
