namespace Wayel.Application.Abstractions.Payments;

public sealed record PaystackSubscriptionLink(
    string SubscriptionCode,
    string? CustomerCode,
    string Status);

public sealed record PaystackWebhookEvent(
    string EventType,
    string? Reference,
    int AmountMinorUnits,
    string? Currency,
    string? SubscriptionCode,
    string? CustomerEmail,
    IReadOnlyDictionary<string, string> Metadata);

public interface IPaystackSubscriptionBilling
{
    bool SubscriptionsEnabled { get; }

    /// <summary>Creates a Paystack plan and returns its plan code (PLN_…).</summary>
    Task<string> EnsurePlanAsync(
        string name,
        int durationMonths,
        int amountMinorUnits,
        CancellationToken cancellationToken = default);

    /// <summary>Resolves the active subscription Paystack created after a successful plan checkout.</summary>
    Task<PaystackSubscriptionLink?> ResolveSubscriptionForCustomerAsync(
        string customerEmail,
        string paystackPlanCode,
        CancellationToken cancellationToken = default);

    Task DisableSubscriptionAsync(string subscriptionCode, CancellationToken cancellationToken = default);

    bool TryParseWebhook(string rawBody, string? signatureHeader, out PaystackWebhookEvent? webhookEvent);
}
