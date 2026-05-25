namespace Wayel.Application.Features.Payments;

/// <summary>
/// Centralised mapping between internal payment-provider identifiers
/// (as written to <c>QuoteCheckoutPaymentRecord.Provider</c> /
/// <c>SuiteCheckoutPaymentRecord.Provider</c>) and the customer-facing
/// label shown on invoices, receipts and admin tooling.
///
/// Kept as a tiny pure helper so it can be shared between the quote
/// and suite invoice HTML builders without dragging either feature
/// namespace into the other.
/// </summary>
internal static class PaymentProviderLabels
{
    /// <summary>
    /// Returns a human-readable label for the supplied provider id.
    /// Unknown ids are title-cased rather than thrown so a new gateway
    /// that ships before this map is updated still renders sensibly
    /// on existing receipts.
    /// </summary>
    public static string Format(string? provider) =>
        provider?.Trim().ToLowerInvariant() switch
        {
            "momo" or "mtn-momo" => "MTN MoMo",
            "paystack" => "Paystack",
            null or "" => "Payment",
            _ => char.ToUpperInvariant(provider!.Trim()[0]) + provider!.Trim()[1..],
        };
}
