namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class CustomerWhatsAppMessageDocument
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public Guid? ParcelId { get; set; }
    public Guid? ShipmentId { get; set; }
    public string CorrelationTag { get; set; } = "";
    public string MessageKind { get; set; } = "";
    public string Body { get; set; } = "";
    public string PhoneE164 { get; set; } = "";
    public string DeliveryStatus { get; set; } = "";
    public string? SkipReason { get; set; }
    public string? ProviderMessageId { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public bool IsImage { get; set; }
    public DateTime SentAtUtc { get; set; }
}
