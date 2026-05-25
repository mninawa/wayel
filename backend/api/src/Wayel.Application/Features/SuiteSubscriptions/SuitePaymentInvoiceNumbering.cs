using System.Globalization;
using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Application.Features.SuiteSubscriptions;

/// <summary>
/// Single source of truth for suite-access payment invoice numbers and the
/// downloaded file names. Both the payments-overview projector (which shows
/// the number in the history table) and the invoice download endpoint route
/// through this so the value the customer sees in the UI matches the value
/// inside the receipt and on the saved filename.
/// </summary>
public static class SuitePaymentInvoiceNumbering
{
    public static string BuildInvoiceNumber(SuiteCheckoutPaymentRecord payment)
    {
        var when = payment.CompletedAtUtc ?? payment.CreatedAtUtc;
        // Mod 10000 by absolute hash keeps the number stable across runs and
        // short enough to be readable on the dashboard / printed invoice.
        var hash = Math.Abs(payment.Reference.GetHashCode()) % 10000;
        return string.Create(
            CultureInfo.InvariantCulture,
            $"INV-{when:yyyy}-{hash:D4}");
    }

    public static string BuildFileName(string invoiceNumber) =>
        $"WeYell-SuiteAccess-{invoiceNumber}.html";
}
