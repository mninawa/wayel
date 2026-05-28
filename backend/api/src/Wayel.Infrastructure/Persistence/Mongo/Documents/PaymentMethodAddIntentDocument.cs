using MongoDB.Bson.Serialization.Attributes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class PaymentMethodAddIntentDocument
{
    [BsonId]
    public string Reference { get; set; } = string.Empty;

    public Guid UserId { get; set; }
    public int AmountMinorUnits { get; set; }
    public string Status { get; set; } = "Pending";
    public string? Label { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}
