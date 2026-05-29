namespace Wayel.Api.Infrastructure.Security;

/// <summary>
/// API hardening controls aligned with common penetration-test findings
/// (OWASP API Security Top 10 — unrestricted access, misconfiguration, unsafe consumption).
/// </summary>
public sealed class ApiSecurityOptions
{
    public const string SectionName = "ApiSecurity";

    /// <summary>Master switch for security middleware (headers, path blocks, method blocks).</summary>
    public bool Enabled { get; init; } = true;

    /// <summary>Emit standard defensive response headers on every API response.</summary>
    public bool SecurityHeadersEnabled { get; init; } = true;

    /// <summary>Reject TRACE / TRACK and other non-API verbs.</summary>
    public bool BlockDangerousHttpMethods { get; init; } = true;

    /// <summary>
    /// Return 404 for common scanner / exploit probe paths so automated
    /// tooling cannot fingerprint the stack.
    /// </summary>
    public bool BlockProbePaths { get; init; } = true;

    /// <summary>Max request body size in bytes (default 12 MiB — invoice / photo uploads).</summary>
    public long MaxRequestBodyBytes { get; init; } = 12 * 1024 * 1024;

    /// <summary>Strip the Kestrel <c>Server</c> response header.</summary>
    public bool SuppressServerHeader { get; init; } = true;

    public int HstsMaxAgeSeconds { get; init; } = 31_536_000;

    /// <summary>Case-insensitive path prefixes that always return 404.</summary>
    public string[] BlockedPathPrefixes { get; init; } =
    [
        "/.env",
        "/.git",
        "/.aws",
        "/.well-known/security.txt",
        "/wp-admin",
        "/wp-login",
        "/wp-content",
        "/phpmyadmin",
        "/pma",
        "/admin.php",
        "/cgi-bin",
        "/actuator",
        "/server-status",
        "/server-info",
        "/xmlrpc.php",
        "/vendor/phpunit",
        "/telescope",
        "/debug",
        "/swagger",
        "/graphql",
    ];

    public ApiRateLimitOptions RateLimit { get; init; } = new();
}

public sealed class ApiRateLimitOptions
{
    /// <summary>Per-IP limit for the general <c>/api/v1</c> surface.</summary>
    public int ApiPermitLimit { get; init; } = 240;

    public int ApiWindowSeconds { get; init; } = 60;

    /// <summary>Per-IP limit for payment gateway callbacks.</summary>
    public int WebhookPermitLimit { get; init; } = 120;

    public int WebhookWindowSeconds { get; init; } = 60;
}
