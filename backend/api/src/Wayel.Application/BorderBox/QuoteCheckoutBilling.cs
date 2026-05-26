using System.Text.RegularExpressions;
using Wayel.Domain.Quotes;

namespace Wayel.Application.BorderBox;

internal static partial class QuoteCheckoutBilling
{
    /// <summary>
    /// Paystack reference shape: <c>QUO-{quoteId8}-{attemptSalt}</c>. The
    /// random per-attempt salt is what prevents Paystack from rejecting a
    /// retry with <c>Duplicate Transaction Reference</c> after a failed or
    /// abandoned initiate. The quote-id prefix stays in for ops triage.
    /// </summary>
    public static string BuildPaystackReference(QuoteId quoteId)
    {
        var prefix = NormalizePaystackReference($"QUO-{quoteId.Value.ToString("N")[..8].ToUpperInvariant()}");
        return $"{prefix}-{SuiteCheckoutBilling.GenerateAttemptSalt()}";
    }

    /// <summary>
    /// MoMo's <c>X-Reference-Id</c> must be a fresh RFC 4122 UUID per attempt.
    /// Each call from a retry is treated as a brand-new logical request, so
    /// returning a fresh GUID is both correct and safe.
    /// </summary>
    public static string BuildMomoReference() => Guid.NewGuid().ToString();

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
