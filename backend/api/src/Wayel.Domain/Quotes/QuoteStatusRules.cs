namespace Wayel.Domain.Quotes;

public static class QuoteStatusRules
{
    public static readonly QuoteStatus[] OpenStatuses =
    [
        QuoteStatus.Draft,
        QuoteStatus.ReadyForReview,
        QuoteStatus.BlockedSuiteExpired,
        QuoteStatus.Approved,
        QuoteStatus.PaymentPending,
    ];

    public static bool IsOpen(QuoteStatus status) => OpenStatuses.Contains(status);

    public static bool CanApprove(QuoteStatus status) =>
        status is QuoteStatus.Approved
            or QuoteStatus.ReadyForReview
            or QuoteStatus.BlockedSuiteExpired;

    public static bool BlocksCustomerActions(QuoteStatus status) =>
        status is QuoteStatus.BlockedSuiteExpired or QuoteStatus.Cancelled or QuoteStatus.Expired;

    public static bool HasPaymentInvoice(QuoteStatus status) =>
        status is QuoteStatus.Paid or QuoteStatus.ConvertedToShipment;

    public static string ToDisplayLabel(QuoteStatus status) => status switch
    {
        QuoteStatus.Draft => "Draft",
        QuoteStatus.ReadyForReview => "Ready for review",
        QuoteStatus.BlockedSuiteExpired => "Suite expired",
        QuoteStatus.Approved => "Approved",
        QuoteStatus.PaymentPending => "Payment pending",
        QuoteStatus.Paid => "Paid",
        QuoteStatus.Expired => "Expired",
        QuoteStatus.Cancelled => "Cancelled",
        QuoteStatus.ConvertedToShipment => "Converted to shipment",
        _ => status.ToString(),
    };
}
