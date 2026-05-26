using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Bff.Shared.ApiClient;
using Wayel.Bff.Shared.Configuration;
using Wayel.Bff.Shared.Sessions;

namespace Wayel.Bff.Shared.Middleware;

/// <summary>
/// For requests that hit the YARP-proxied <c>/api</c> path, looks up the encrypted session
/// from the auth cookie, refreshes the access token if it's close to expiring, and adds an
/// <c>Authorization: Bearer …</c> header. Anonymous requests pass through unchanged so the
/// downstream API can return 401.
/// </summary>
public sealed class AccessTokenRelayMiddleware(
    RequestDelegate next,
    BffSessionStore sessionStore,
    WayelAuthApiClient apiClient,
    BffRefreshCoordinator refreshCoordinator,
    IOptions<BffOptions> options,
    ILogger<AccessTokenRelayMiddleware> logger)
{
    private readonly TimeSpan _refreshWindow = TimeSpan.FromSeconds(options.Value.RefreshIfExpiringWithinSeconds);

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // Ops dashboard sends its own Bearer (wayel-ops) or X-Wayel-Ops-Key.
        // Do not replace with the customer BFF cookie — localhost cookies are
        // shared across ports, so a portal session on :8080 would clobber ops auth on :8081.
        if (context.Request.Path.StartsWithSegments("/api/v1/borderbox/ops", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // Three auth shapes to handle:
        //
        //  • Cookie-authenticated (OIDC sign-in): we have a BFF session, so
        //    we inject its bearer below. This deliberately overwrites any
        //    stale `Authorization` header the SPA may have attached (e.g.
        //    a leftover token in sessionStorage from a previous password
        //    login) — the cookie is the source of truth.
        //
        //  • JwtBearer-authenticated (password-login SPA, no BFF session):
        //    sessionStore.TryRead returns false. Fall through to next()
        //    without touching the request — YARP forwards the already-
        //    validated bearer header verbatim.
        //
        //  • Anonymous: same as above; the upstream API decides whether
        //    the route allows it.
        if (context.User.Identity?.IsAuthenticated != true ||
            !sessionStore.TryRead(context.User, out var session))
        {
            await next(context);
            return;
        }

        var nowUtc = DateTime.UtcNow;
        if (session.AccessTokenExpiringWithin(_refreshWindow, nowUtc))
        {
            // Route the refresh through the per-session coordinator so N
            // parallel API calls don't all race to consume the same refresh
            // token (which the upstream treats as suspected theft and uses to
            // burn the whole session — see BffRefreshCoordinator for context).
            //
            // The delegate is intentionally cookie-agnostic: every caller
            // (the winning rotator AND any waiters that pick up the cached
            // result) writes its own request's cookie via UpdateAsync below.
            // That keeps each HTTP response self-consistent without doubling
            // up the writes inside the delegate.
            var rotated = await refreshCoordinator.CoordinateRefreshAsync(
                session.SessionId,
                _refreshWindow,
                async ct =>
                {
                    var refreshed = await apiClient.RefreshAsync(session.RefreshToken, ct);
                    if (refreshed.IsSuccess && refreshed.Session is { } updated)
                    {
                        return MapSession(updated);
                    }

                    logger.LogWarning(
                        "Refresh-token rotation failed for user {UserId}: {ErrorCode} ({Status}). Signing out.",
                        session.UserId,
                        refreshed.ErrorCode,
                        (int)refreshed.StatusCode);
                    return null;
                },
                context.RequestAborted);

            if (rotated is null)
            {
                refreshCoordinator.Invalidate(session.SessionId);
                await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            // Whether we did the rotation ourselves or picked up a sibling's
            // cached result, this request's cookie still encodes the stale
            // session. Re-issue it with the rotated payload so the browser's
            // next request carries the new access + refresh tokens.
            await sessionStore.UpdateAsync(context, rotated);
            session = rotated;
        }

        context.Request.Headers.Authorization = $"Bearer {session.AccessToken}";
        await next(context);
    }

    public static BffSession MapSession(WayelAuthSessionDto dto) => new(
        dto.AccessToken,
        dto.AccessTokenExpiresOnUtc,
        dto.RefreshToken,
        dto.RefreshTokenExpiresOnUtc,
        dto.SessionId,
        dto.UserId,
        dto.TenantId,
        dto.Email,
        dto.DisplayName,
        dto.Role);
}

