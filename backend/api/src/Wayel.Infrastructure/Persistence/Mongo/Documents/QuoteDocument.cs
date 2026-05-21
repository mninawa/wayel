using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class QuoteDocument
{
    public QuoteId Id { get; set; }
    public ShipmentId ShipmentId { get; set; }
    public decimal TotalLandedCost { get; set; }
    public DateTime ValidUntil { get; set; }
    public QuoteApprovalStatus ApprovalStatus { get; set; }
    public string? ApprovalLockedReason { get; set; }

    public static QuoteDocument From(Quote q) => new() { Id=q.Id, ShipmentId=q.ShipmentId, TotalLandedCost=q.TotalLandedCost, ValidUntil=q.ValidUntil, ApprovalStatus=q.ApprovalStatus, ApprovalLockedReason=q.ApprovalLockedReason };
    public Quote ToDomain() => Quote.Rehydrate(Id, ShipmentId, TotalLandedCost, ValidUntil, ApprovalStatus, ApprovalLockedReason);
}
