using Wayel.Domain.Common;
using Wayel.Domain.Shipments;

namespace Wayel.Domain.Quotes;

public sealed class Quote : AggregateRoot<QuoteId>
{
    private Quote(QuoteId id, ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil, QuoteApprovalStatus approvalStatus, string? approvalLockedReason)
        : base(id)
    {
        ShipmentId = shipmentId;
        TotalLandedCost = totalLandedCost;
        ValidUntil = validUntil;
        ApprovalStatus = approvalStatus;
        ApprovalLockedReason = approvalLockedReason;
    }

    public ShipmentId ShipmentId { get; }
    public decimal TotalLandedCost { get; }
    public DateTime ValidUntil { get; }
    public QuoteApprovalStatus ApprovalStatus { get; private set; }
    public string? ApprovalLockedReason { get; }

    public static Quote Create(ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil, bool approvalLocked, string? lockReason) =>
        new(QuoteId.New(), shipmentId, totalLandedCost, validUntil,
            approvalLocked ? QuoteApprovalStatus.Locked : QuoteApprovalStatus.Pending, lockReason);

    public Result Approve(bool approvalLocked, string? lockReason)
    {
        if (approvalLocked)
        {
            return Result.Failure(Error.Forbidden("suite.approval_locked", lockReason ?? "Renew suite access to approve quotes."));
        }
        ApprovalStatus = QuoteApprovalStatus.Approved;
        return Result.Success();
    }

    public static Quote Rehydrate(QuoteId id, ShipmentId shipmentId, decimal totalLandedCost, DateTime validUntil,
        QuoteApprovalStatus approvalStatus, string? approvalLockedReason) =>
        new(id, shipmentId, totalLandedCost, validUntil, approvalStatus, approvalLockedReason);
}
