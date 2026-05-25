using System.Globalization;
using System.Net;
using System.Text;
using Wayel.Application.Features.Payments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

/// <summary>
/// Renders the customer-facing suite-access payment receipt as a single
/// self-contained HTML document. Mirrors the styling of the quote payment
/// invoice so customers see one consistent invoice format across the
/// suite-access subscription and per-shipment quote receipts.
/// </summary>
internal static class SuitePaymentInvoiceHtmlBuilder
{
    public static byte[] Build(
        string invoiceNumber,
        User user,
        string? suiteNumber,
        DateTime paidAtUtc,
        string paymentReference,
        string paymentProvider,
        string planName,
        int planDurationMonths,
        decimal amountZar,
        DateTime? subscriptionStartsAtUtc,
        DateTime? subscriptionExpiresAtUtc)
    {
        var paidLocal = paidAtUtc.ToString("d MMMM yyyy, HH:mm 'UTC'", CultureInfo.InvariantCulture);
        var customer = WebUtility.HtmlEncode(user.DisplayName);
        var email = WebUtility.HtmlEncode(user.Email.Value);
        var suite = WebUtility.HtmlEncode(suiteNumber ?? "—");
        var planLabel = WebUtility.HtmlEncode(planName);
        var providerLabel = PaymentProviderLabels.Format(paymentProvider);

        string subscriptionRow;
        if (subscriptionStartsAtUtc is { } start && subscriptionExpiresAtUtc is { } end)
        {
            var startStr = start.ToString("d MMM yyyy", CultureInfo.InvariantCulture);
            var endStr = end.ToString("d MMM yyyy", CultureInfo.InvariantCulture);
            subscriptionRow = $"<div>Access period: {WebUtility.HtmlEncode(startStr)} — {WebUtility.HtmlEncode(endStr)}</div>";
        }
        else
        {
            var monthsLabel = planDurationMonths == 1
                ? "1 month"
                : $"{planDurationMonths} months";
            subscriptionRow = $"<div>Access period: {WebUtility.HtmlEncode(monthsLabel)} from activation</div>";
        }

        var html =
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\" />"
            + "<title>" + WebUtility.HtmlEncode(invoiceNumber) + " — WeYell</title>"
            + "<style>"
            + "body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:2rem}"
            + "h1{font-size:1.5rem;margin:0 0 .25rem;color:#1d4ed8}"
            + ".meta{color:#64748b;font-size:.9rem;margin-bottom:1.5rem}"
            + ".grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem}"
            + ".box{border:1px solid #e2e8f0;border-radius:8px;padding:1rem}"
            + ".box h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 .5rem}"
            + "table{width:100%;border-collapse:collapse;margin:1rem 0}"
            + "th,td{padding:.5rem 0;border-bottom:1px solid #f1f5f9;text-align:left}"
            + "th{font-size:.75rem;color:#64748b}"
            + "td.num{text-align:right;font-variant-numeric:tabular-nums}"
            + ".total{font-size:1.25rem;font-weight:700;color:#15803d;text-align:right;margin-top:.5rem}"
            + ".note{font-size:.8rem;color:#475569;background:#f8fafc;padding:.75rem;border-radius:8px}"
            + "@media print{body{margin:.5in}}"
            + "</style></head><body>"
            + "<h1>Suite Access receipt</h1>"
            + "<p class=\"meta\">WeYell — cross-border shipping to Eswatini</p>"
            + "<div class=\"grid\"><div class=\"box\"><h2>Invoice</h2>"
            + "<div><strong>" + WebUtility.HtmlEncode(invoiceNumber) + "</strong></div>"
            + "<div>Paid: " + WebUtility.HtmlEncode(paidLocal) + "</div>"
            + "<div>" + WebUtility.HtmlEncode(providerLabel) + " ref: " + WebUtility.HtmlEncode(paymentReference) + "</div></div>"
            + "<div class=\"box\"><h2>Customer</h2><div>" + customer + "</div><div>" + email + "</div>"
            + "<div>Suite: " + suite + "</div></div></div>"
            + "<div class=\"box\"><h2>Subscription</h2>"
            + "<div><strong>" + planLabel + "</strong></div>"
            + subscriptionRow
            + "</div>"
            + "<table><thead><tr><th>Description</th><th class=\"num\">Amount (ZAR)</th></tr></thead><tbody>"
            + "<tr><td>" + planLabel + "</td><td class=\"num\">R " + amountZar.ToString("N2", CultureInfo.InvariantCulture) + "</td></tr>"
            + "</tbody></table>"
            + "<div class=\"total\">Total paid: R " + amountZar.ToString("N2", CultureInfo.InvariantCulture) + "</div>"
            + "<p class=\"note\">This receipt covers your WeYell suite-access subscription. "
            + "It does not include freight, customs or per-shipment fees — those are issued as separate invoices when you pay for individual shipments.</p>"
            + "</body></html>";

        return Encoding.UTF8.GetBytes(html);
    }
}
