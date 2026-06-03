namespace Wayel.Infrastructure.Billing;

public sealed class PaystackOptions
{
    public const string SectionName = "Billing:Paystack";

    public bool Enabled { get; init; } = true;
    public string SecretKey { get; init; } = string.Empty;
    public string PublicKey { get; init; } = string.Empty;
    public string ApiBaseUrl { get; init; } = "https://api.paystack.co";
    public string Currency { get; init; } = "ZAR";

    /// <summary>Small charge (minor units) used to verify and tokenise a new card — default R1.00.</summary>
    public int VerifyChargeMinorUnits { get; init; } = 100;

    /// <summary>When true, verification charges are refunded after the card is saved.</summary>
    public bool RefundVerifyCharge { get; init; } = true;

    /// <summary>When true, suite checkout uses Paystack plans/subscriptions for auto-renewal.</summary>
    public bool SubscriptionsEnabled { get; init; } = true;

    /// <summary>Paystack webhook signing secret (whsec from dashboard). Empty disables signature checks (dev only).</summary>
    public string WebhookSecret { get; init; } = string.Empty;
}
