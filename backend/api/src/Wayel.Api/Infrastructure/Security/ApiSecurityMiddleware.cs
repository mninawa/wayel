using Microsoft.Extensions.Options;

namespace Wayel.Api.Infrastructure.Security;

/// <summary>
/// Applies penetration-test remediations at the HTTP edge: security headers,
/// scanner path blocking, and rejection of dangerous HTTP methods.
/// </summary>
internal sealed class ApiSecurityMiddleware(
    RequestDelegate next,
    IOptions<ApiSecurityOptions> options)
{
    private static readonly HashSet<string> DangerousMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        HttpMethods.Trace,
        HttpMethods.Connect,
        "TRACK",
    };

    public async Task InvokeAsync(HttpContext context)
    {
        var cfg = options.Value;
        if (!cfg.Enabled)
        {
            await next(context);
            return;
        }

        if (cfg.BlockDangerousHttpMethods && DangerousMethods.Contains(context.Request.Method))
        {
            context.Response.StatusCode = StatusCodes.Status405MethodNotAllowed;
            context.Response.Headers.Allow = "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS";
            return;
        }

        if (cfg.BlockProbePaths && IsBlockedProbePath(context.Request.Path, cfg.BlockedPathPrefixes))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (cfg.SecurityHeadersEnabled)
        {
            var headers = context.Response.Headers;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            headers["X-Permitted-Cross-Domain-Policies"] = "none";
            headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            headers["Cache-Control"] = "no-store";
        }

        await next(context);
    }

    private static bool IsBlockedProbePath(PathString path, IReadOnlyList<string> blockedPrefixes)
    {
        if (!path.HasValue)
        {
            return false;
        }

        var value = path.Value!;
        foreach (var prefix in blockedPrefixes)
        {
            if (string.IsNullOrWhiteSpace(prefix))
            {
                continue;
            }

            if (value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
