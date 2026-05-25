using System.Text.RegularExpressions;
using Wayel.Domain.Quotes;

namespace Wayel.Application.BorderBox;

internal static partial class QuoteCheckoutBilling
{
    public static string BuildPaystackReference(QuoteId quoteId, int attemptCount) =>
        attemptCount == 0
            ? $"QUO-{quoteId.Value.ToString("N")[..12].ToUpperInvariant()}"
            : $"{NormalizePaystackReference($"QUO-{quoteId.Value.ToString("N")[..8]}")}-P{attemptCount + 1}";

    public static string NormalizePaystackReference(string value)
    {
        var trimmed = value.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "QUOTE";
        }

        var normalized = InvalidPaystackReferenceChars().Replace(trimmed, "-");
        return normalized.Length <= 100 ? normalized : normalized[..100];
    }

    [GeneratedRegex(@"[^a-zA-Z0-9\-_\.]")]
    private static partial Regex InvalidPaystackReferenceChars();
}
