using System.ComponentModel.DataAnnotations;

namespace Wayel.Bff.Shared.Configuration;

/// <summary>
/// Per-audience BFF settings. Each BFF (admin, client, external) supplies its own.
/// </summary>
public sealed class BffOptions
{
    public const string SectionName = "Bff";

    /// <summary>Logical name used in cookies, audit logs, and CORS responses (e.g. "admin").</summary>
    [Required]
    public string Audience { get; init; } = string.Empty;

    /// <summary>Where the SPA lives (used to validate post-login redirects).</summary>
    [Required]
    public Uri SpaBaseUri { get; init; } = new("http://localhost:4200");

    /// <summary>Base URL of the core Wayel.Api this BFF proxies to.</summary>
    [Required]
    public Uri ApiBaseUri { get; init; } = new("http://localhost:5099");

    /// <summary>Cookie session lifetime — the rolling window that keeps the user signed in.</summary>
    [Range(1, 30 * 24 * 60)]
    public int SessionLifetimeMinutes { get; init; } = 14 * 24 * 60;

    /// <summary>
    /// If the access token has fewer than this many seconds left when a request arrives,
    /// the BFF refreshes it before forwarding.
    /// </summary>
    [Range(10, 600)]
    public int RefreshIfExpiringWithinSeconds { get; init; } = 60;

    /// <summary>Cookie name used for the BFF session. Override per-audience to avoid collisions.</summary>
    public string CookieName { get; init; } = ".Wayel.Bff";

    /// <summary>Set to false in local dev when running on plain http://.</summary>
    public bool RequireHttpsCookie { get; init; } = true;
}
