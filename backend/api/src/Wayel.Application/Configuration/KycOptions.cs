namespace Wayel.Application.Configuration;

/// <summary>
/// Customer KYC behaviour. Production should use a document/identity provider;
/// <see cref="AutoVerifyOnSubmit"/> is for local/demo convenience only.
/// </summary>
public sealed class KycOptions
{
    public const string SectionName = "Kyc";

    /// <summary>
    /// When true, submitting KYC immediately marks the user as Verified (skip manual review).
    /// </summary>
    public bool AutoVerifyOnSubmit { get; init; }

    /// <summary>
    /// Shared secret for ops endpoints (<c>X-Wayel-Ops-Key</c> header). Leave empty to disable.
    /// </summary>
    public string OpsApiKey { get; init; } = string.Empty;

    /// <summary>Optional additional ops keys mapped to roles (clerk, lead, finance).</summary>
    public Dictionary<string, string> OpsRoleByApiKey { get; init; } =
        new(StringComparer.Ordinal);

    /// <summary>When true and <see cref="IdAnalyzerApiKey"/> is set, KYC checks call ID Analyzer.</summary>
    public bool IdAnalyzerEnabled { get; init; }

    public string IdAnalyzerApiKey { get; init; } = string.Empty;

    /// <summary>KYC profile ID or preset (e.g. security_medium). Required when ID Analyzer is enabled.</summary>
    public string IdAnalyzerProfileId { get; init; } = "security_medium";

    public string IdAnalyzerBaseUrl { get; init; } = "https://api2.idanalyzer.com";

    /// <summary>When true, an ID Analyzer decision of accept auto-marks the customer as Verified.</summary>
    public bool AutoApproveOnProviderPass { get; init; }
}
