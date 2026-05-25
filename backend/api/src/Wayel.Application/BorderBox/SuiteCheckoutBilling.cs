using System.Text.RegularExpressions;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.BorderBox;

internal static partial class SuiteCheckoutBilling
{
    public static string ResolveSuiteNumber(User user, SuiteSubscription? subscription) =>
        subscription?.SuiteNumber ?? $"WY-{user.Id.Value.ToString()[..8].ToUpperInvariant()}";

    public static bool IsWithinPaidPeriod(SuiteSubscription? subscription, DateTime nowUtc)
    {
        if (subscription is null)
        {
            return false;
        }

        subscription.RefreshStatus(nowUtc);
        return subscription.ExpiresAt is { } expiresAt && expiresAt > nowUtc;
    }

    /// <summary>
    /// Paystack reference: suite number for first payment, then suite number + renewal suffix.
    /// </summary>
    public static string BuildPaystackReference(string suiteNumber, int completedPaymentCount) =>
        completedPaymentCount == 0
            ? NormalizePaystackReference(suiteNumber)
            : $"{NormalizePaystackReference(suiteNumber)}-R{completedPaymentCount + 1}";

    public static string NormalizePaystackReference(string suiteNumber)
    {
        var trimmed = suiteNumber.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "SUITE";
        }

        var normalized = InvalidPaystackReferenceChars().Replace(trimmed, "-");
        return normalized.Length <= 100 ? normalized : normalized[..100];
    }

    [GeneratedRegex(@"[^a-zA-Z0-9\-_\.]")]
    private static partial Regex InvalidPaystackReferenceChars();
}
