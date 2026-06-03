using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.BorderBox;

internal static partial class SuiteCheckoutBilling
{
    public static int ToMinorUnits(decimal amountZar) =>
        (int)Math.Round(amountZar * 100m, MidpointRounding.AwayFromZero);

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
    /// Paystack reference shape: <c>{suite}[-R{renewal#}]-{attemptSalt}</c>.
    ///
    /// <para>
    /// Paystack rejects any reference it has seen before with
    /// <c>Duplicate Transaction Reference</c>, so a deterministic reference
    /// (the old shape) bricks every retry after a single failed/abandoned
    /// initiate. The random per-attempt salt is what makes retries safe;
    /// the optional <c>-R{n}</c> chunk is purely cosmetic / for ops triage
    /// so a quick glance at a reference still tells you which renewal it
    /// belonged to.
    /// </para>
    /// </summary>
    public static string BuildPaystackReference(string suiteNumber, int completedPaymentCount)
    {
        var prefix = NormalizePaystackReference(suiteNumber);
        var renewalSuffix = completedPaymentCount == 0
            ? string.Empty
            : $"-R{completedPaymentCount + 1}";
        return $"{prefix}{renewalSuffix}-{GenerateAttemptSalt()}";
    }

    /// <summary>
    /// MoMo's <c>X-Reference-Id</c> must be a fresh RFC 4122 UUID per attempt
    /// — same reasoning as the Paystack salt above. We used to derive this
    /// deterministically from the suite number so the API was idempotent on
    /// retries, but in practice that meant a retry after a failed call kept
    /// hitting the same cached failure.
    /// </summary>
    public static string BuildMomoReference() => Guid.NewGuid().ToString();

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

    /// <summary>
    /// 8-char lower-hex random tag, e.g. <c>"a1b2c3d4"</c>. Cryptographically
    /// random so two near-simultaneous attempts can't collide.
    /// </summary>
    internal static string GenerateAttemptSalt() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant();

    [GeneratedRegex(@"[^a-zA-Z0-9\-_\.]")]
    private static partial Regex InvalidPaystackReferenceChars();
}
