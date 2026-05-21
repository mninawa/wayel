using System.ComponentModel.DataAnnotations;

namespace Wayel.Bff.Shared.Configuration;

/// <summary>
/// Subset of the API's <c>Jwt</c> options that the BFF needs to *validate*
/// access tokens issued by Wayel.Api. Bound from the same <c>Jwt</c>
/// configuration section so a single env block (e.g. <c>Jwt__SigningKey</c>)
/// configures both the API and every BFF host.
///
/// <para>
/// Why the BFF needs this at all: parent / staff / admin SPAs that sign in
/// via password (not OIDC) only get back a bearer token in JSON — they
/// never receive the cookie the BFF's default Cookie scheme looks for.
/// Without a JwtBearer fallback the BFF would 401 every subsequent
/// SPA call to <c>/api/...</c>, leaving inboxes / dashboards empty
/// even though the API has data. With it the BFF can validate the
/// SPA-supplied bearer locally, set <c>HttpContext.User</c>, and
/// pass the same Authorization header through to the upstream API.
/// </para>
/// </summary>
public sealed class BffJwtOptions
{
    public const string SectionName = "Jwt";

    [Required, MinLength(32)]
    public string SigningKey { get; init; } = string.Empty;

    [Required]
    public string Issuer { get; init; } = "wayel-api";

    [Required]
    public string Audience { get; init; } = "wayel-clients";
}
