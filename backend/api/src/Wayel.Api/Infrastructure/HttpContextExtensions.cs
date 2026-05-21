using Microsoft.Net.Http.Headers;

namespace Wayel.Api.Infrastructure;

internal static class HttpContextExtensions
{
    /// <summary>
    /// Returns the client IP, preferring the first hop in <c>X-Forwarded-For</c> when the
    /// request has been forwarded by a trusted proxy (BFF / load balancer).
    /// </summary>
    public static string? GetClientIp(this HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwarded) && forwarded.Count > 0)
        {
            var first = forwarded[0];
            if (!string.IsNullOrWhiteSpace(first))
            {
                var comma = first.IndexOf(',', StringComparison.Ordinal);
                return (comma > 0 ? first[..comma] : first).Trim();
            }
        }

        return context.Connection.RemoteIpAddress?.ToString();
    }

    public static string? GetUserAgent(this HttpContext context) =>
        context.Request.Headers[HeaderNames.UserAgent].ToString() is { Length: > 0 } ua ? ua : null;
}
