using System.Text.RegularExpressions;
using Wayel.Domain.Quotes;

namespace Wayel.Application.BorderBox;

internal static partial class QuoteCheckoutBilling
{
    public static string BuildPaystackReference(QuoteId quoteId, int attemptCount) =>
        attemptCount == 0
            ? $"QUO-{quoteId.Value.ToString("N")[..12].ToUpperInvariant()}"
            : $"{NormalizePaystackReference($"QUO-{quoteId.Value.ToString("N")[..8]}")}-P{attemptCount + 1}";

    /// <summary>
    /// MoMo requires the X-Reference-Id to be a valid RFC 4122 UUID. We derive it
    /// deterministically from the quote id + attempt so retries don't collide.
    /// </summary>
    public static string BuildMomoReference(QuoteId quoteId, int attemptCount)
    {
        if (attemptCount == 0)
        {
            return quoteId.Value.ToString();
        }
        // Bump the LSB so retries get a distinct (still v4-ish) UUID.
        var bytes = quoteId.Value.ToByteArray();
        bytes[15] = (byte)(bytes[15] ^ (attemptCount & 0xFF));
        return new Guid(bytes).ToString();
    }

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
