using System.Globalization;
using System.Net;
using System.Text;
using Wayel.Application.Features.Payments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

internal static class QuotePaymentInvoiceHtmlBuilder
{
    public static byte[] Build(
        string invoiceNumber,
        string quoteDisplayNumber,
        User user,
        string? suiteNumber,
        DateTime paidAtUtc,
        string paymentReference,
        string paymentProvider,
        decimal amountZar,
        IReadOnlyList<QuoteBreakdownLineDto> breakdown,
        string deliveryMethod,
        int parcelCount)
    {
        var paidLocal = paidAtUtc.ToString("d MMMM yyyy, HH:mm 'UTC'", CultureInfo.InvariantCulture);
        var customer = WebUtility.HtmlEncode(user.DisplayName);
        var email = WebUtility.HtmlEncode(user.Email.Value);
        var suite = WebUtility.HtmlEncode(suiteNumber ?? "—");
        var providerLabel = PaymentProviderLabels.Format(paymentProvider);

        var rows = new StringBuilder();
        foreach (var line in breakdown)
        {
            var style = line.IncludedInTotal ? "" : " class=\"muted\"";
            var tag = line.IncludedInTotal ? "" : " <span class=\"tag\">not in total</span>";
            var amount = line.Amount.ToString("N2", CultureInfo.InvariantCulture);
            rows.Append("<tr")
                .Append(style)
                .Append("><td>")
                .Append(WebUtility.HtmlEncode(line.Label))
                .Append(tag)
                .Append("</td><td class=\"num\">R ")
                .Append(amount)
                .Append("</td></tr>");
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
            + "tr.muted td{color:#64748b;font-style:italic}"
            + ".tag{font-size:.65rem;text-transform:uppercase;font-style:normal}"
            + ".total{font-size:1.25rem;font-weight:700;color:#15803d;text-align:right;margin-top:.5rem}"
            + ".note{font-size:.8rem;color:#475569;background:#f8fafc;padding:.75rem;border-radius:8px}"
            + "@media print{body{margin:.5in}}"
            + "</style></head><body>"
            + "<h1>Payment invoice</h1>"
            + "<p class=\"meta\">WeYell — cross-border shipping to Eswatini</p>"
            + "<div class=\"grid\"><div class=\"box\"><h2>Invoice</h2>"
            + "<div><strong>" + WebUtility.HtmlEncode(invoiceNumber) + "</strong></div>"
            + "<div>Quote: " + WebUtility.HtmlEncode(quoteDisplayNumber) + "</div>"
            + "<div>Paid: " + paidLocal + "</div>"
            + "<div>" + WebUtility.HtmlEncode(providerLabel) + " ref: " + WebUtility.HtmlEncode(paymentReference) + "</div></div>"
            + "<div class=\"box\"><h2>Customer</h2><div>" + customer + "</div><div>" + email + "</div>"
            + "<div>Suite: " + suite + "</div></div></div>"
            + "<div class=\"box\"><h2>Shipment</h2><div>"
            + parcelCount + " parcel(s) · " + WebUtility.HtmlEncode(deliveryMethod) + " · Ship to Eswatini</div></div>"
            + "<table><thead><tr><th>Description</th><th class=\"num\">Amount (ZAR)</th></tr></thead><tbody>"
            + rows
            + "</tbody></table>"
            + "<div class=\"total\">Total paid: R " + amountZar.ToString("N2", CultureInfo.InvariantCulture) + "</div>"
            + "<p class=\"note\">This invoice covers customs, freight and WeYell fees. "
            + "Goods value paid to Takealot/retailers is shown for reference only when marked not in total. "
            + "Import duty is remitted to Eswatini. VAT treatment follows your quote at checkout.</p>"
            + "</body></html>";

        return Encoding.UTF8.GetBytes(html);
    }
}
