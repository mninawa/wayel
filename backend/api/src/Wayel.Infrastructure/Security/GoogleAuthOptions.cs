namespace Wayel.Infrastructure.Security;

public sealed class GoogleAuthOptions
{
    public const string SectionName = "GoogleAuth";

    /// <summary>
    /// OAuth client IDs that are allowed to mint id_tokens for this API. (web BFF, mobile, etc.)
    /// May be empty in non-production environments — the SSO endpoint will then refuse all tokens.
    /// </summary>
    public IReadOnlyList<string> ClientIds { get; init; } = [];

    /// <summary>Issuer values Google may put in the id_token. Both must validate.</summary>
    public IReadOnlyList<string> AcceptedIssuers { get; init; } = ["https://accounts.google.com", "accounts.google.com"];

    /// <summary>Refresh window for the JWKS cache.</summary>
    public TimeSpan JwksRefreshInterval { get; init; } = TimeSpan.FromHours(6);

    public Uri DiscoveryUri { get; init; } = new("https://accounts.google.com/.well-known/openid-configuration");
}
