using MongoDB.Bson.Serialization.Attributes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class CustomerSavedCardDocument
{
    [BsonId]
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public string Provider { get; set; } = "paystack";
    public string AuthorizationCode { get; set; } = string.Empty;
    public string CardType { get; set; } = string.Empty;
    public string Last4 { get; set; } = string.Empty;
    public string ExpMonth { get; set; } = string.Empty;
    public string ExpYear { get; set; } = string.Empty;
    public string? Bank { get; set; }
    public string? Label { get; set; }
    public bool IsDefault { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
