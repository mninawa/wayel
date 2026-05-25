namespace Wayel.Domain.Quotes;

/// <summary>Customer-facing quote lifecycle (Phase 1).</summary>
public enum QuoteStatus
{
    Draft = 0,
    ReadyForReview = 1,
    BlockedSuiteExpired = 2,
    Approved = 3,
    PaymentPending = 4,
    Paid = 5,
    Expired = 6,
    Cancelled = 7,
    ConvertedToShipment = 8,
}
