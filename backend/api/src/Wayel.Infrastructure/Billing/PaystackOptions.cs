namespace Wayel.Infrastructure.Billing;

public sealed class PaystackOptions
{
    public const string SectionName = "Billing:Paystack";

    public bool Enabled { get; init; } = true;
    public string SecretKey { get; init; } = string.Empty;
    public string PublicKey { get; init; } = string.Empty;
    public string ApiBaseUrl { get; init; } = "https://api.paystack.co";
    public string Currency { get; init; } = "ZAR";
    /// <summary>When true and SecretKey is empty, simulate successful payments (local dev only).</summary>
    public bool AllowSimulatedPayments { get; init; }
}
