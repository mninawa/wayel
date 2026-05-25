using MongoDB.Bson.Serialization.Attributes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class QuotePaymentInvoiceDocument
{
    [BsonId]
    public Guid QuoteId { get; set; }

    public Guid UserId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public string PaymentReference { get; set; } = string.Empty;
    public DateTime PaidAtUtc { get; set; }
    public decimal AmountZar { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;

    // Default to "paystack" so legacy documents written before this field
    // existed continue to render with the original gateway label after a
    // self-heal rebuild.
    public string PaymentProvider { get; set; } = "paystack";
}
