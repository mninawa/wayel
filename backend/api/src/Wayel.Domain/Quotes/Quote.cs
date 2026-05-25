using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Domain.Quotes;

public sealed class Quote : AggregateRoot<QuoteId>
{
    private Quote(
        QuoteId id,
        UserId userId,
        ShipmentId? shipmentId,
        decimal totalLandedCost,
        string deliveryMethod,
        DateTime createdAtUtc,
        DateTime? publishedAtUtc,
        DateTime validUntil,
        QuoteStatus status,
        string? statusReason)
        : base(id)
    {
        UserId = userId;
        ShipmentId = shipmentId;
        TotalLandedCost = totalLandedCost;
        DeliveryMethod = deliveryMethod;
        CreatedAtUtc = createdAtUtc;
        PublishedAtUtc = publishedAtUtc;
        ValidUntil = validUntil;
        Status = status;
        StatusReason = statusReason;
    }

    public UserId UserId { get; }
    public ShipmentId? ShipmentId { get; private set; }
    public decimal TotalLandedCost { get; }
    public string DeliveryMethod { get; }
    public DateTime CreatedAtUtc { get; }
    public DateTime? PublishedAtUtc { get; private set; }
    public DateTime ValidUntil { get; private set; }
    public QuoteStatus Status { get; private set; }
    public string? StatusReason { get; private set; }

    /// <summary>Legacy bridge for existing UI strings.</summary>
    public QuoteApprovalStatus ApprovalStatus => Status switch
    {
        QuoteStatus.Approved or QuoteStatus.PaymentPending or QuoteStatus.Paid or QuoteStatus.ConvertedToShipment
            => QuoteApprovalStatus.Approved,
        QuoteStatus.BlockedSuiteExpired => QuoteApprovalStatus.Locked,
        QuoteStatus.Cancelled or QuoteStatus.Expired => QuoteApprovalStatus.Rejected,
        _ => QuoteApprovalStatus.Pending,
    };

    public string? ApprovalLockedReason =>
        Status == QuoteStatus.BlockedSuiteExpired ? StatusReason : null;

    public static Quote CreateDraft(
        UserId userId,
        decimal totalLandedCost,
        string deliveryMethod,
        DateTime createdAtUtc) =>
        new(
            QuoteId.New(),
            userId,
            null,
            totalLandedCost,
            deliveryMethod.Trim(),
            createdAtUtc,
            null,
            createdAtUtc,
            QuoteStatus.Draft,
            null);

    public Result Publish(DateTime publishedAtUtc, bool suiteExpired, string? suiteMessage)
    {
        if (Status != QuoteStatus.Draft)
        {
            return Result.Failure(Error.Validation("quote.not_draft", "Only draft quotes can be published."));
        }

        PublishedAtUtc = publishedAtUtc;
        ValidUntil = publishedAtUtc.AddHours(72);
        Status = suiteExpired ? QuoteStatus.BlockedSuiteExpired : QuoteStatus.ReadyForReview;
        StatusReason = suiteExpired ? suiteMessage : null;
        return Result.Success();
    }

    public Result Approve(bool suiteExpired, string? suiteMessage, DateTime nowUtc)
    {
        if (suiteExpired)
        {
            return Result.Failure(
                Error.Forbidden("suite.approval_locked", suiteMessage ?? "Renew suite access to approve quotes."));
        }

        if (nowUtc > ValidUntil)
        {
            Status = QuoteStatus.Expired;
            return Result.Failure(Error.Validation("quote.expired", "This quote has expired. Request a new quote."));
        }

        if (Status == QuoteStatus.Approved)
        {
            return Result.Success();
        }

        if (Status is not QuoteStatus.ReadyForReview)
        {
            return Result.Failure(
                Error.Validation("quote.invalid_state", "This quote cannot be approved in its current state."));
        }

        Status = QuoteStatus.Approved;
        StatusReason = null;
        return Result.Success();
    }

    public Result BeginPayment(DateTime nowUtc)
    {
        if (nowUtc > ValidUntil)
        {
            Status = QuoteStatus.Expired;
            return Result.Failure(Error.Validation("quote.expired", "This quote has expired. Request a new quote."));
        }

        if (Status == QuoteStatus.PaymentPending)
        {
            return Result.Success();
        }

        if (Status != QuoteStatus.Approved)
        {
            return Result.Failure(
                Error.Validation("quote.not_payable", "Approve this quote before paying."));
        }

        Status = QuoteStatus.PaymentPending;
        return Result.Success();
    }

    public Result TryCancel()
    {
        if (Status is QuoteStatus.Paid or QuoteStatus.ConvertedToShipment)
        {
            return Result.Failure(
                Error.Validation("quote.cannot_cancel", "Paid quotes cannot be cancelled."));
        }

        if (Status is QuoteStatus.Cancelled or QuoteStatus.Expired)
        {
            return Result.Failure(Error.Validation("quote.already_closed", "This quote is already closed."));
        }

        Cancel();
        return Result.Success();
    }

    public void AttachShipment(ShipmentId shipmentId) => ShipmentId = shipmentId;

    public void MarkPaymentPending() => Status = QuoteStatus.PaymentPending;

    public void MarkPaid() => Status = QuoteStatus.Paid;

    public void MarkConvertedToShipment() => Status = QuoteStatus.ConvertedToShipment;

    public void Cancel()
    {
        Status = QuoteStatus.Cancelled;
        StatusReason = "Cancelled by customer.";
    }

    public static Quote Rehydrate(
        QuoteId id,
        UserId userId,
        ShipmentId? shipmentId,
        decimal totalLandedCost,
        string deliveryMethod,
        DateTime createdAtUtc,
        DateTime? publishedAtUtc,
        DateTime validUntil,
        QuoteStatus status,
        string? statusReason) =>
        new(
            id,
            userId,
            shipmentId,
            totalLandedCost,
            deliveryMethod,
            createdAtUtc,
            publishedAtUtc,
            validUntil,
            status,
            statusReason);

    /// <summary>Maps legacy persisted quotes (shipment-linked, approval enum only).</summary>
    public static Quote FromLegacy(
        QuoteId id,
        UserId userId,
        ShipmentId shipmentId,
        decimal totalLandedCost,
        DateTime validUntil,
        QuoteApprovalStatus approvalStatus,
        string? approvalLockedReason,
        string deliveryMethod,
        DateTime createdAtUtc)
    {
        var status = approvalStatus switch
        {
            QuoteApprovalStatus.Approved => QuoteStatus.Approved,
            QuoteApprovalStatus.Locked => QuoteStatus.BlockedSuiteExpired,
            QuoteApprovalStatus.Rejected => QuoteStatus.Cancelled,
            _ => QuoteStatus.Approved,
        };

        return new(
            id,
            userId,
            shipmentId,
            totalLandedCost,
            deliveryMethod,
            createdAtUtc,
            createdAtUtc,
            validUntil,
            status,
            approvalLockedReason);
    }
}
