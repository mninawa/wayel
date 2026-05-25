namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// MTN MoMo Open API integration settings. Three credential sets are needed:
/// <list type="bullet">
///   <item><c>SubscriptionKey</c> — Ocp-Apim-Subscription-Key for the Collections product.</item>
///   <item><c>DisbursementsSubscriptionKey</c> — same, for the Disbursements product (optional).</item>
///   <item><c>ApiUser</c> + <c>ApiKey</c> — generated per environment via sandbox provisioning or supplied by MTN in production.</item>
/// </list>
/// </summary>
public sealed class MtnMomoOptions
{
    public const string SectionName = "Billing:MtnMomo";

    public bool Enabled { get; init; }

    /// <summary>Base URL: <c>https://sandbox.momodeveloper.mtn.com</c> or production gateway host.</summary>
    public string BaseUrl { get; init; } = "https://sandbox.momodeveloper.mtn.com";

    /// <summary>X-Target-Environment header value. <c>sandbox</c> | <c>mtnswaziland</c> | <c>mtnnigeria</c> | etc.</summary>
    public string TargetEnvironment { get; init; } = "sandbox";

    /// <summary>Ocp-Apim-Subscription-Key for the Collections product.</summary>
    public string SubscriptionKey { get; init; } = string.Empty;

    /// <summary>Ocp-Apim-Subscription-Key for the Disbursements product. Optional; refunds/payouts disabled when blank.</summary>
    public string DisbursementsSubscriptionKey { get; init; } = string.Empty;

    /// <summary>API user UUID (Microsoft.AspNetCore.Authorization Basic credential id). Generated via the sandbox provisioning flow.</summary>
    public string ApiUser { get; init; } = string.Empty;

    /// <summary>API key generated for the API user via <c>POST /v1_0/apiuser/{userId}/apikey</c>.</summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>Currency code accepted by the wallet. <c>SZL</c> for production Eswatini; sandbox always quotes <c>EUR</c>.</summary>
    public string Currency { get; init; } = "EUR";

    /// <summary>Public host (no scheme) MTN will POST async transaction completion callbacks to.</summary>
    public string CallbackHost { get; init; } = string.Empty;

    /// <summary>When true and credentials are blank, simulate successful charges (local dev only).</summary>
    public bool AllowSimulatedPayments { get; init; }

    /// <summary>
    /// Auto-provision a sandbox API user + key at startup when running in sandbox and <see cref="ApiUser"/> / <see cref="ApiKey"/> are blank.
    /// Never enable in production.
    /// </summary>
    public bool AutoProvisionSandbox { get; init; }

    /// <summary>How long the OAuth access token is cached before forcing a refresh. MTN tokens are valid 60 minutes; refresh at 50.</summary>
    public TimeSpan TokenLifetime { get; init; } = TimeSpan.FromMinutes(50);

    /// <summary>Per-transaction limit MTN eSwatini enforces on consumer wallets (E 5 000). Used for client-side validation hints.</summary>
    public int PerTransactionMinorUnitsLimit { get; init; } = 500_000;
}
