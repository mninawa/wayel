using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Bff.Shared.ApiClient;
using Wayel.Bff.Shared.Configuration;
using Wayel.Bff.Shared.Middleware;
using Wayel.Bff.Shared.Sessions;

namespace Wayel.Bff.Shared.Endpoints;

public static class BffAuthEndpoints
{
    public static IEndpointRouteBuilder MapBffAuth(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/bff/auth").WithTags("BFF Auth");

        group.MapGet("/login", (
                HttpContext http,
                [AsParameters] LoginQuery query,
                IOptions<BffOptions> bffOptions) =>
        {
            var redirect = SafeReturnUrl(query.ReturnUrl, bffOptions.Value.SpaBaseUri);

            return Results.Challenge(
                new AuthenticationProperties { RedirectUri = redirect },
                [OpenIdConnectDefaults.AuthenticationScheme]);
        })
        .AllowAnonymous()
        .WithName("BffLogin")
        .WithSummary("Begin OIDC challenge against the configured identity provider")
        .Produces(StatusCodes.Status302Found);

        group.MapPost("/logout", async (HttpContext http, WayelAuthApiClient apiClient, BffSessionStore sessionStore) =>
        {
            if (sessionStore.TryRead(http.User, out var session))
            {
                await apiClient.LogoutAsync(session.RefreshToken, http.RequestAborted);
            }

            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        })
        .RequireAuthorization()
        .WithName("BffLogout")
        .WithSummary("Revoke the upstream session and clear the BFF cookie")
        .Produces(StatusCodes.Status204NoContent)
        .Produces(StatusCodes.Status401Unauthorized);

        group.MapGet("/me", [Authorize] async (
                HttpContext http,
                BffSessionStore sessionStore,
                WayelAuthApiClient apiClient) =>
        {
            if (!sessionStore.TryRead(http.User, out var session))
            {
                return Results.Unauthorized();
            }

            // Enrich the cookie-resident identity with the upstream
            // tenant block (branding, support contacts, theme). The
            // call uses the bearer the AccessTokenRelay middleware
            // would otherwise add — we replay it here directly so the
            // SPA gets a single round-trip and a consistent shape.
            // Failures degrade gracefully: the BFF still returns the
            // identity bits it has from the cookie.
            BffTenantSummary? tenantSummary = null;
            var enrichment = await apiClient.GetMeAsync(session.AccessToken, http.RequestAborted);
            if (enrichment?.Tenant is { } t)
            {
                tenantSummary = new BffTenantSummary(
                    t.TenantId,
                    t.Name,
                    t.Slug,
                    t.Status,
                    t.DisplayName,
                    t.PrimaryColor,
                    t.SecondaryColor,
                    t.AccentColor,
                    t.BackgroundColor,
                    t.SurfaceColor,
                    t.TextColor,
                    t.LogoUrl,
                    t.FaviconUrl,
                    t.CustomDomain,
                    t.Theme,
                    t.SupportEmail,
                    t.SupportPhone,
                    t.WebsiteUrl);
            }

            return Results.Ok(new BffMeResponse(
                session.UserId,
                session.TenantId,
                session.Email,
                session.DisplayName,
                session.Role,
                session.AccessTokenExpiresOnUtc,
                tenantSummary));
        })
        .WithName("BffMe")
        .WithSummary("Return the signed-in user's profile (and tenant branding) from the BFF session cookie")
        .Produces<BffMeResponse>(StatusCodes.Status200OK)
        .Produces(StatusCodes.Status401Unauthorized);

        return routes;
    }

    /// <summary>
    /// Called from the OIDC OnTokenValidated event to swap the Google id_token for a Wayel
    /// auth session and write it into the BFF cookie. Centralised here so each BFF host can
    /// just plug it into its OIDC pipeline.
    /// </summary>
    public static async Task ExchangeAndSignInAsync(TokenValidatedContext context)
    {
        var http = context.HttpContext;
        var services = http.RequestServices;
        var apiClient = services.GetRequiredService<WayelAuthApiClient>();
        var sessionStore = services.GetRequiredService<BffSessionStore>();
        var bffOptions = services.GetRequiredService<IOptions<BffOptions>>().Value;
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Wayel.Bff.OidcExchange");

        // In OIDC authorization-code flow the id_token arrives in the
        // *token endpoint response*, NOT in the initial protocol message
        // (which only carries the auth code). Read TokenEndpointResponse
        // first and only fall back to ProtocolMessage for implicit-style
        // flows that put it in the authorization response.
        var idToken = context.TokenEndpointResponse?.IdToken
                      ?? context.ProtocolMessage?.IdToken;
        if (string.IsNullOrEmpty(idToken))
        {
            logger.LogError("OIDC OnTokenValidated fired without an id_token in the security token.");
            context.Fail("Missing id_token from upstream provider.");
            return;
        }

        var audience = NormalizeAudience(bffOptions.Audience);
        if (audience is null)
        {
            logger.LogError("BFF Audience '{Audience}' is not a known SSO audience.", bffOptions.Audience);
            context.Fail("BFF audience misconfigured.");
            return;
        }

        var exchange = await apiClient.ExchangeGoogleIdTokenAsync(idToken, audience, http.RequestAborted);
        if (!exchange.IsSuccess || exchange.Session is null)
        {
            logger.LogWarning(
                "Wayel.Api refused SSO exchange (audience={Audience}): {ErrorCode} {ErrorMessage}",
                audience,
                exchange.ErrorCode,
                exchange.ErrorMessage);
            context.Fail("Wayel.Api refused this identity.");
            return;
        }

        var session = AccessTokenRelayMiddleware.MapSession(exchange.Session);
        var principal = sessionStore.BuildPrincipal(session, CookieAuthenticationDefaults.AuthenticationScheme);

        // Replace the OIDC-built principal with our own so only Wayel claims survive the cookie round-trip.
        context.Principal = principal;
        context.Properties!.IsPersistent = true;
    }

    /// <summary>
    /// Maps the per-BFF <c>Bff:Audience</c> string to the wire-level audience name
    /// expected by Wayel.Api. Returns <c>null</c> for unknown values so misconfigured
    /// BFFs fail loudly instead of silently exchanging tokens against the wrong policy.
    /// </summary>
    private static string? NormalizeAudience(string raw) => raw?.Trim().ToLowerInvariant() switch
    {
        "admin" => "Admin",
        "client" => "Client",
        "external" => "External",
        _ => null,
    };

    /// <summary>
    /// Coerce <paramref name="raw"/> into a same-origin redirect target. Used both
    /// at <c>/bff/auth/login</c> (to validate the caller's <c>?returnUrl=</c>) and
    /// after the OIDC callback (to scrub a stale <c>RedirectUri</c> that may have
    /// been encoded into the correlation cookie back when the BFF was running with
    /// a different <c>SpaBaseUri</c> — e.g. a dev stack restarted with a new port).
    ///
    /// Behaviour:
    ///   * Empty / null → return the configured SPA root.
    ///   * Absolute URL on the same authority as <paramref name="spaBaseUri"/> → kept.
    ///   * Absolute URL on a *different* authority → discarded, falls back to the SPA root.
    ///   * Relative path → resolved against the SPA root.
    /// </summary>
    internal static string SafeReturnUrl(string? raw, Uri spaBaseUri)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return spaBaseUri.ToString();
        }

        if (Uri.TryCreate(spaBaseUri, raw, out var combined) &&
            combined.Authority.Equals(spaBaseUri.Authority, StringComparison.OrdinalIgnoreCase))
        {
            return combined.ToString();
        }

        return spaBaseUri.ToString();
    }

    public sealed record LoginQuery(string? ReturnUrl);

    public sealed record BffMeResponse(
        Guid UserId,
        Guid? TenantId,
        string Email,
        string DisplayName,
        string Role,
        DateTime AccessTokenExpiresOnUtc,
        BffTenantSummary? Tenant);

    /// <summary>
    /// Branding + identity slice of the signed-in user's home tenant.
    /// Mirrors the API's <c>TenantSummary</c> shape verbatim. SPAs use
    /// this to paint chrome (colours, logo, favicon, theme, support
    /// contacts) without a second round-trip.
    /// </summary>
    public sealed record BffTenantSummary(
        Guid TenantId,
        string Name,
        string Slug,
        string Status,
        string? DisplayName,
        string? PrimaryColor,
        string? SecondaryColor,
        string? AccentColor,
        string? BackgroundColor,
        string? SurfaceColor,
        string? TextColor,
        string? LogoUrl,
        string? FaviconUrl,
        string? CustomDomain,
        string Theme,
        string? SupportEmail,
        string? SupportPhone,
        string? WebsiteUrl);
}
