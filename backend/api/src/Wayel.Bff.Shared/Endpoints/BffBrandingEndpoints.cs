using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using Wayel.Bff.Shared.ApiClient;

namespace Wayel.Bff.Shared.Endpoints;

/// <summary>
/// Public, unauthenticated branding endpoints exposed by every BFF.
/// Today the only entry is <c>GET /bff/branding/by-domain/{host}</c>,
/// used by the SPA shell to pre-paint a tenant's chrome (colours,
/// logo, theme) before the visitor signs in. The response shape is
/// the same <see cref="BffAuthEndpoints.BffTenantSummary"/> the
/// authenticated <c>/bff/auth/me</c> already serves so the SPA has
/// one painter for both pre- and post-login states.
/// </summary>
public static class BffBrandingEndpoints
{
    /// <summary>
    /// Header name a developer can set to pretend the visitor's host
    /// is something else (e.g. <c>parents.sun-valley.example</c>) so
    /// they can preview the pre-login chrome from <c>localhost:4200</c>
    /// without owning the DNS record. Honoured **only** outside
    /// Production — see <see cref="MapBffBranding"/>.
    /// </summary>
    public const string DevHostOverrideHeader = "X-Wayel-Branding-Host";

    /// <summary>
    /// Query-string equivalent of <see cref="DevHostOverrideHeader"/>.
    /// Wins over the path segment but loses to the header so a
    /// browser-side bookmarklet (using the query string) doesn't
    /// stomp a deliberate header set by, e.g., a Postman collection.
    /// </summary>
    public const string DevHostOverrideQuery = "host";

    public static IEndpointRouteBuilder MapBffBranding(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/bff/branding").WithTags("BFF Branding");

        group.MapGet("/by-domain/{host}", async (
                string host,
                WayelAuthApiClient apiClient,
                IHostEnvironment env,
                HttpContext http) =>
        {
            // Dev-only host override: when we're NOT in Production a
            // header or query parameter can pretend the visitor came
            // from a different host. This is the escape hatch that
            // lets `localhost:4200` preview a tenant's pre-login
            // chrome without owning the DNS record. Production
            // deliberately ignores the override — the browser's
            // address bar (and therefore the {host} segment the SPA
            // builds) is the only trusted source there.
            var resolvedHost = host;
            if (!env.IsProduction())
            {
                if (http.Request.Headers.TryGetValue(DevHostOverrideHeader, out var headerValue)
                    && !string.IsNullOrWhiteSpace(headerValue.ToString()))
                {
                    resolvedHost = headerValue.ToString();
                }
                else if (http.Request.Query.TryGetValue(DevHostOverrideQuery, out var queryValue)
                    && !string.IsNullOrWhiteSpace(queryValue.ToString()))
                {
                    resolvedHost = queryValue.ToString();
                }
            }

            // The API call returns null for both "no tenant claimed
            // this host" (the common case for the platform's own
            // hostnames) and any non-2xx upstream blip. Either way the
            // SPA should treat that as "no override, paint the
            // platform default" — we surface a 204 so the client can
            // distinguish that from a 200-with-payload without parsing
            // a body.
            var dto = await apiClient.GetBrandingByDomainAsync(resolvedHost, http.RequestAborted);
            if (dto is null)
            {
                return Results.NoContent();
            }

            return Results.Ok(new BffAuthEndpoints.BffTenantSummary(
                dto.TenantId,
                dto.Name,
                dto.Slug,
                dto.Status,
                dto.DisplayName,
                dto.PrimaryColor,
                dto.SecondaryColor,
                dto.AccentColor,
                dto.BackgroundColor,
                dto.SurfaceColor,
                dto.TextColor,
                dto.LogoUrl,
                dto.FaviconUrl,
                dto.CustomDomain,
                dto.Theme,
                dto.SupportEmail,
                dto.SupportPhone,
                dto.WebsiteUrl));
        })
        .AllowAnonymous()
        .WithName("BffBrandingByDomain")
        .WithSummary("Resolve a tenant's public branding by host header (pre-login paint)")
        .Produces<BffAuthEndpoints.BffTenantSummary>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status204NoContent);

        return routes;
    }
}
