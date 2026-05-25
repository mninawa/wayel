using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Wayel.Bff.Shared.Composition;

namespace Wayel.Bff.Shared.Middleware;

/// <summary>
/// CSRF guard for the BFF.
///
/// The BFF authenticates with a same-site session cookie, which is exactly
/// the kind of credential CSRF attacks abuse. We mitigate it with a
/// double-submit token:
///
///   - Every authenticated, safe-method response sets/refreshes a
///     non-HttpOnly <c>XSRF-TOKEN</c> cookie. The SPA's
///     <c>HttpClientXsrfModule</c> picks it up and echoes it as the
///     <c>X-XSRF-TOKEN</c> header on every state-changing request.
///   - State-changing requests (POST/PUT/PATCH/DELETE) under <c>/bff</c>
///     or <c>/api</c> are validated against that header. A missing or
///     mismatched token returns 400 before the request reaches the handler
///     or the YARP proxy.
///
/// The OIDC return path (<c>/signin-oidc</c>) and the OIDC login challenge
/// (<c>/bff/auth/login</c>) are explicitly bypassed — those don't carry
/// the cookie yet, and the OIDC handler has its own state/nonce checks.
/// </summary>
internal sealed class BffAntiforgeryMiddleware(
    RequestDelegate next,
    IAntiforgery antiforgery,
    ILogger<BffAntiforgeryMiddleware> logger)
{
    private static readonly string[] ProtectedPathPrefixes = ["/bff/", "/api/"];

    public async Task Invoke(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        // 1) Issue / refresh the antiforgery tokens on safe-method,
        //    authenticated requests. We don't gate on path here so the SPA
        //    can prime the pair via a simple GET /bff/auth/me (its first
        //    call after login).
        //
        //    GetAndStoreTokens persists the *cookie token* in the
        //    framework-default HttpOnly cookie. It also returns the
        //    *request token* — but doesn't write it anywhere by itself.
        //    Angular's HttpClient (and our raw-fetch helpers) reads the
        //    non-HttpOnly `XSRF-TOKEN` cookie and echoes it on
        //    `X-XSRF-TOKEN`, so we write the request token to that cookie
        //    here. The framework then validates header == request token
        //    paired against the HttpOnly cookie token.
        if (IsSafeMethod(context.Request.Method) &&
            context.User?.Identity?.IsAuthenticated == true)
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            if (!string.IsNullOrEmpty(tokens.RequestToken))
            {
                context.Response.Cookies.Append(
                    BffHostBuilder.CsrfCookieName,
                    tokens.RequestToken,
                    new CookieOptions
                    {
                        HttpOnly = false,
                        Secure = context.Request.IsHttps,
                        SameSite = SameSiteMode.Lax,
                        Path = "/",
                    });
            }
        }

        // 2) Validate state-changing requests under the protected paths.
        //
        // Bearer-authenticated requests (Authorization: Bearer …) skip CSRF:
        // the threat model only applies to ambient credentials (cookies)
        // browsers attach automatically. A bearer token lives in
        // sessionStorage and is read by SPA code, so an attacker can't
        // forge one via a cross-site form/submit. Skipping here lets the
        // password-login SPAs POST without first priming an XSRF cookie.
        //
        // WeYell internal ops (parcel receiving, KYC queue, etc.) is
        // authenticated with X-Wayel-Ops-Key on the API — not a BFF cookie.
        // The ops SPA sets that header from localStorage; cross-site forms
        // cannot forge custom headers, so CSRF does not apply.
        if (!IsSafeMethod(context.Request.Method) &&
            IsProtectedPath(path) &&
            !IsBypassedPath(path) &&
            !IsBorderBoxOpsApiPath(path) &&
            !HasBearerAuthorization(context))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context);
            }
            catch (AntiforgeryValidationException ex)
            {
                logger.LogWarning(
                    ex,
                    "Rejecting state-changing request to {Path} due to missing/invalid CSRF token.",
                    path);

                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsync(
                    "{\"type\":\"https://wayel.dev/errors/csrf\",\"title\":\"Invalid CSRF token\",\"status\":400}");
                return;
            }
        }

        await next(context);
    }

    private static bool IsSafeMethod(string method) =>
        HttpMethods.IsGet(method) ||
        HttpMethods.IsHead(method) ||
        HttpMethods.IsOptions(method) ||
        HttpMethods.IsTrace(method);

    private static bool IsProtectedPath(string path)
    {
        foreach (var prefix in ProtectedPathPrefixes)
        {
            if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private static bool HasBearerAuthorization(HttpContext context)
    {
        var auth = context.Request.Headers.Authorization.ToString();
        return !string.IsNullOrEmpty(auth)
            && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsBorderBoxOpsApiPath(string path) =>
        path.StartsWith("/api/v1/borderbox/ops/", StringComparison.OrdinalIgnoreCase);

    private static bool IsBypassedPath(string path)
    {
        // OIDC handshakes can't carry our antiforgery token — they're driven
        // by the upstream provider. The handlers have their own nonce/state
        // checks so we don't lose protection.
        return path.StartsWith("/bff/auth/login", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/signin-oidc", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/signout-callback-oidc", StringComparison.OrdinalIgnoreCase)
            // First-time sign-in / token rotation has no XSRF cookie yet; API is AllowAnonymous.
            || path.Equals("/api/v1/auth/login", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/v1/auth/register", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/v1/auth/sso/google", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/v1/auth/refresh", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/v1/auth/logout", StringComparison.OrdinalIgnoreCase)
            // Pre-sign-in invitation accept-with-password flow: the
            // recipient is anonymous and has no XSRF cookie; the API
            // validates the one-shot token + creates the user atomically.
            || path.Equals("/api/v1/staff-invitations/accept-password", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/v1/borderbox/ops/auth/", StringComparison.OrdinalIgnoreCase)
            // BFF wrapper that performs the same accept and additionally
            // mints the cookie session — same anonymous threat model.
            || path.Equals("/bff/invitations/accept-password", StringComparison.OrdinalIgnoreCase);
    }
}
