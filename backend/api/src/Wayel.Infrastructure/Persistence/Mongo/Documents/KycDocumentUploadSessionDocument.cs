using MongoDB.Bson.Serialization.Attributes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class KycDocumentUploadSessionDocument
{
    [BsonId]
    public Guid DocumentId { get; set; }

    public Guid UserId { get; set; }
    public string Side { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; }
    public bool BytesReceived { get; set; }
}
