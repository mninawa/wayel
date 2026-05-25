using System.ComponentModel.DataAnnotations;

namespace Wayel.Bff.Shared.Configuration;

public sealed class GoogleOidcOptions
{
    public const string SectionName = "GoogleOidc";

    [Required]
    public string ClientId { get; init; } = string.Empty;

    [Required]
    public string ClientSecret { get; init; } = string.Empty;

    /// <summary>OIDC discovery authority — Google's well-known endpoint root.</summary>
    public Uri Authority { get; init; } = new("https://accounts.google.com");

    /// <summary>
    /// Comma-separated allowlist of email domains permitted to sign in via Google for this BFF.
    /// Empty = allow any domain. Useful for the admin BFF to restrict to staff domains.
    /// </summary>
    public IReadOnlyList<string> AllowedHostedDomains { get; init; } = [];

    /// <summary>
    /// Use built-in Google OIDC endpoints instead of fetching the discovery document
    /// on each login challenge. Defaults to on in Development (Docker-friendly).
    /// </summary>
    public bool UseStaticMetadata { get; init; }
}
