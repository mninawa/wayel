using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Wayel.Bff.Shared.ApiClient;

/// <summary>
/// Server-to-server client used by the BFF to call Wayel.Api auth endpoints
/// (SSO exchange, refresh, logout). Errors are surfaced as a typed result so the
/// caller doesn't have to catch on the happy path.
/// </summary>
public sealed class WayelAuthApiClient(HttpClient http)
{
    public Task<WayelAuthResult> ExchangeGoogleIdTokenAsync(
        string idToken,
        string audience,
        CancellationToken cancellationToken) =>
        PostAsync("/api/v1/auth/sso/google", new SsoSignInGoogleBody(idToken, audience), cancellationToken);

    public Task<WayelAuthResult> RefreshAsync(string refreshToken, CancellationToken cancellationToken) =>
        PostAsync("/api/v1/auth/refresh", new RefreshBody(refreshToken), cancellationToken);

    /// <summary>
    /// Forward a staff-invitation accept-with-password call to the API. The
    /// API hosts the canonical anonymous endpoint; we wrap it here so the
    /// BFF can also mint a cookie session on the same response (otherwise
    /// the SPA would land in a half-signed-in state where the token was in
    /// the JSON body but no cookie exists for the relay middleware to
    /// inject on subsequent <c>/api/...</c> calls).
    /// </summary>
    public Task<WayelAuthResult> AcceptInvitationWithPasswordAsync(
        string token,
        string password,
        string? displayName,
        CancellationToken cancellationToken) =>
        PostAsync(
            "/api/v1/staff-invitations/accept-password",
            new AcceptStaffInvitationWithPasswordBody(token, password, displayName),
            cancellationToken);

    public async Task LogoutAsync(string refreshToken, CancellationToken cancellationToken)
    {
        using var response = await http.PostAsJsonAsync(
            new Uri("/api/v1/auth/logout", UriKind.Relative),
            new LogoutBody(refreshToken),
            cancellationToken);

        // Logout is intentionally idempotent on the server; ignore non-2xx as best-effort.
        _ = response;
    }

    /// <summary>
    /// Calls the API's <c>GET /api/v1/auth/me</c> on behalf of the
    /// signed-in user using their bearer token. Returns <c>null</c> on any
    /// non-2xx so callers can degrade gracefully (the BFF still has the
    /// session cookie's identity bits even if the enrichment call fails).
    /// </summary>
    public async Task<WayelMeDto?> GetMeAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            new Uri("/api/v1/auth/me", UriKind.Relative));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        return await response.Content.ReadFromJsonAsync<WayelMeDto>(cancellationToken);
    }

    /// <summary>
    /// Calls the API's public <c>GET /api/v1/tenants/by-domain/{host}</c>
    /// endpoint, used by the BFF to pre-paint a tenant's branding for an
    /// unauthenticated visitor that landed on a custom domain. Returns
    /// <c>null</c> for 404 (no tenant has claimed this host — the
    /// platform's own hostnames hit this every time) and for any other
    /// non-2xx, so the caller can degrade gracefully to the platform
    /// default brand without inspecting status codes.
    /// </summary>
    public async Task<WayelTenantSummaryDto?> GetBrandingByDomainAsync(
        string host,
        CancellationToken cancellationToken)
    {
        // Defensive: the BFF endpoint already validates this, but a
        // misuse from a future caller would otherwise hit
        // /api/v1/tenants/by-domain/ which would 404 on the route
        // itself rather than on the lookup.
        if (string.IsNullOrWhiteSpace(host)) return null;

        var encoded = Uri.EscapeDataString(host.Trim());
        try
        {
            using var response = await http.GetAsync(
                new Uri($"/api/v1/tenants/by-domain/{encoded}", UriKind.Relative),
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            return await response.Content.ReadFromJsonAsync<WayelTenantSummaryDto>(cancellationToken);
        }
        catch (HttpRequestException)
        {
            // DNS / connection refused / TLS mismatch — same degradation as a
            // non-2xx: caller paints the platform default brand.
            return null;
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // HttpClient timeout.
            return null;
        }
    }

    private async Task<WayelAuthResult> PostAsync<TBody>(
        string path,
        TBody body,
        CancellationToken cancellationToken)
    {
        using var response = await http.PostAsJsonAsync(new Uri(path, UriKind.Relative), body, cancellationToken);

        if (response.IsSuccessStatusCode)
        {
            var session = await response.Content.ReadFromJsonAsync<WayelAuthSessionDto>(cancellationToken);
            return session is not null
                ? WayelAuthResult.Success(session)
                : WayelAuthResult.Failure(HttpStatusCode.BadGateway, "wayel.empty_response", "Empty response from Wayel.Api.");
        }

        ProblemDetailsDto? problem = null;
        try
        {
            problem = await response.Content.ReadFromJsonAsync<ProblemDetailsDto>(cancellationToken);
        }
        catch
        {
            // Body may be empty / non-JSON — fall through to defaults.
        }

        return WayelAuthResult.Failure(
            response.StatusCode,
            problem?.Type ?? "wayel.api_error",
            problem?.Detail ?? response.ReasonPhrase ?? "Wayel.Api rejected the request.");
    }

    private sealed record SsoSignInGoogleBody(string IdToken, string Audience);
    private sealed record RefreshBody(string RefreshToken);
    private sealed record LogoutBody(string RefreshToken);
    private sealed record AcceptStaffInvitationWithPasswordBody(string Token, string Password, string? DisplayName);
    private sealed record ProblemDetailsDto(string? Type, string? Title, string? Detail, int? Status);
}

public sealed record WayelAuthSessionDto(
    string AccessToken,
    DateTime AccessTokenExpiresOnUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresOnUtc,
    string SessionId,
    Guid UserId,
    Guid? TenantId,
    string Email,
    string DisplayName,
    string Role);

/// <summary>
/// Wire-shape mirror of the API's <c>MeResponse</c>. Kept here (instead of
/// shared with Wayel.Application) so the BFF layer doesn't take a direct
/// project dependency on application internals — the only contract we
/// promise is the JSON shape.
/// </summary>
public sealed record WayelMeDto(
    Guid UserId,
    Guid? TenantId,
    string Email,
    string DisplayName,
    string Role,
    WayelTenantSummaryDto? Tenant);

public sealed record WayelTenantSummaryDto(
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

public sealed record WayelAuthResult(
    bool IsSuccess,
    WayelAuthSessionDto? Session,
    HttpStatusCode StatusCode,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static WayelAuthResult Success(WayelAuthSessionDto session) =>
        new(true, session, HttpStatusCode.OK, null, null);

    public static WayelAuthResult Failure(HttpStatusCode status, string code, string message) =>
        new(false, null, status, code, message);
}
