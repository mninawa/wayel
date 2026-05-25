using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class KycSubmissionDocument
{
    public Guid Id { get; set; }
    public UserId UserId { get; set; }
    public KycStatus KycStatus { get; set; }
    public DateTime? SubmittedAtUtc { get; set; }
    public DateTime? ReviewedAtUtc { get; set; }
    public string? ReviewedBy { get; set; }
    public string? RejectionReason { get; set; }
    public string? ReviewerNotes { get; set; }
    public DateTime? IdDocumentExpiryUtc { get; set; }
    public int? FaceMatchScore { get; set; }
    public string? ProviderName { get; set; }
    public string? ProviderTransactionId { get; set; }
    public List<KycDocumentEntryDocument> Documents { get; set; } = [];
    public List<KycCheckEntryDocument> Checks { get; set; } = [];
}

internal sealed class KycDocumentEntryDocument
{
    public Guid DocumentId { get; set; }
    public string Side { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAtUtc { get; set; }
    public bool Confirmed { get; set; }
}

internal sealed class KycCheckEntryDocument
{
    public string Type { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}
