using System.Text.RegularExpressions;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing;

/// <summary>
/// Routes checkout requests to the right <see cref="IPaymentGateway"/>.
///
/// <para>
/// All configured gateways are surfaced to every customer — the customer picks
/// MoMo or Paystack themselves on the checkout page. The MSISDN is used only as
/// a *hint* to mark a gateway as "recommended": an MTN Eswatini number nudges
/// MoMo to the top of the list, otherwise Paystack stays recommended. Final
/// MoMo eligibility is enforced at submit-time by validating the supplied
/// number against the MoMo Collections account-holder probe (see
/// <c>IMomoAccountValidator</c>).
/// </para>
/// </summary>
internal sealed partial class PaymentGatewayResolver(IEnumerable<IPaymentGateway> gateways) : IPaymentGatewayResolver
{
    private readonly IReadOnlyDictionary<string, IPaymentGateway> _gateways = gateways.ToDictionary(
        g => g.ProviderName,
        StringComparer.OrdinalIgnoreCase);

    public IPaymentGateway Resolve(string provider)
    {
        var key = string.IsNullOrWhiteSpace(provider) ? PaymentProviders.Paystack : provider.Trim();
        if (!_gateways.TryGetValue(key, out var gateway))
        {
            throw new InvalidOperationException($"No payment gateway registered for provider '{key}'.");
        }
        if (!gateway.IsConfigured)
        {
            throw new InvalidOperationException($"Payment gateway '{key}' is not configured.");
        }
        return gateway;
    }

    public string DefaultFor(string? payerMsisdn)
    {
        if (IsMtnEswatiniMsisdn(payerMsisdn)
            && _gateways.TryGetValue(PaymentProviders.Momo, out var momo)
            && momo.IsConfigured)
        {
            return PaymentProviders.Momo;
        }
        return PaymentProviders.Paystack;
    }

    public IReadOnlyList<PaymentProviderOption> ListAvailableForCustomer(string? payerMsisdn)
    {
        var recommended = DefaultFor(payerMsisdn);
        var options = new List<PaymentProviderOption>(_gateways.Count);
        // Surface every registered gateway so the SPA can render both options
        // even when one is awaiting credentials — it'll show the unconfigured
        // ones as disabled "coming soon" tiles instead of hiding them entirely.
        foreach (var gateway in _gateways.Values.OrderBy(g => ProviderOrder(g.ProviderName)))
        {
            options.Add(new PaymentProviderOption(
                gateway.ProviderName,
                gateway.DisplayName,
                IsConfigured: gateway.IsConfigured,
                IsRecommended: gateway.IsConfigured
                    && string.Equals(gateway.ProviderName, recommended, StringComparison.OrdinalIgnoreCase)));
        }
        return options;
    }

    /// <summary>
    /// Stable display order: Paystack first (most familiar checkout for the
    /// majority of customers), MoMo second, anything else after.
    /// </summary>
    private static int ProviderOrder(string providerName) => providerName switch
    {
        var p when string.Equals(p, PaymentProviders.Paystack, StringComparison.OrdinalIgnoreCase) => 0,
        var p when string.Equals(p, PaymentProviders.Momo, StringComparison.OrdinalIgnoreCase) => 1,
        _ => 100,
    };

    /// <summary>
    /// Matches Eswatini mobile numbers used as a soft hint to recommend MoMo.
    /// Not an authority on MoMo eligibility — the canonical check is the
    /// MoMo Collections account-holder probe at validation time.
    /// </summary>
    internal static bool IsMtnEswatiniMsisdn(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var digits = DigitsOnly().Replace(raw, string.Empty);
        if (digits.Length == 8 && digits[0] == '7')
        {
            return IsMtnEswatiniPrefix(digits);
        }
        if (digits.Length == 11 && digits.StartsWith("268", StringComparison.Ordinal))
        {
            return digits[3] == '7' && IsMtnEswatiniPrefix(digits[3..]);
        }
        return false;
    }

    private static bool IsMtnEswatiniPrefix(string subscriber) =>
        subscriber.Length >= 2
        && subscriber[0] == '7'
        && (subscriber[1] == '6' || subscriber[1] == '8' || subscriber[1] == '9');

    [GeneratedRegex(@"\D")]
    private static partial Regex DigitsOnly();
}
