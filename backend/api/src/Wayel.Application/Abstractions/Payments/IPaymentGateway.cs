namespace Wayel.Application.Abstractions.Payments;

/// <summary>Canonical provider identifiers used across the platform.</summary>
public static class PaymentProviders
{
    public const string Paystack = "paystack";
    public const string Momo = "momo";
}

public sealed record PaymentInitializeRequest(
    string Email,
    string Reference,
    int AmountMinorUnits,
    string CallbackUrl,
    IReadOnlyDictionary<string, string> Metadata,
    string? PayerMsisdn = null,
    string? PayerMessage = null,
    string? PayeeNote = null);

public sealed record PaymentInitializeResult(
    string Reference,
    string AuthorizationUrl,
    string AccessCode);

public sealed record PaymentVerifyResult(
    string Reference,
    string Status,
    int AmountMinorUnits,
    string Currency);

public interface IPaymentGateway
{
    /// <summary>Canonical provider identifier — e.g. <c>"paystack"</c> or <c>"momo"</c>.</summary>
    string ProviderName { get; }

    /// <summary>Human-readable name for checkout UIs.</summary>
    string DisplayName { get; }

    Task<PaymentInitializeResult> InitializeChargeAsync(
        PaymentInitializeRequest request,
        CancellationToken cancellationToken = default);

    Task<PaymentVerifyResult> VerifyChargeAsync(
        string reference,
        CancellationToken cancellationToken = default);

    bool IsConfigured { get; }

    string? PublicKey { get; }
}

/// <summary>Per-customer view of available providers, used by checkout UI.</summary>
public sealed record PaymentProviderOption(
    string Provider,
    string DisplayName,
    bool IsConfigured,
    bool IsRecommended);

/// <summary>
/// Resolves the right <see cref="IPaymentGateway"/> for a given customer / explicit choice.
/// Wayel currently supports Paystack (ZAR cards) and MTN MoMo (Eswatini wallets).
/// </summary>
public interface IPaymentGatewayResolver
{
    IPaymentGateway Resolve(string provider);

    /// <summary>Provider name we'll default to if the caller hasn't picked one.</summary>
    string DefaultFor(string? payerMsisdn);

    IReadOnlyList<PaymentProviderOption> ListAvailableForCustomer(string? payerMsisdn);
}
