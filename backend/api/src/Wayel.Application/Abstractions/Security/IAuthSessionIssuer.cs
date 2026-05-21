using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Security;

/// <summary>
/// Builds a complete sign-in session: access token + refresh token + user-facing claims.
/// Used by every login path (password, SSO, refresh) so the response shape stays consistent.
/// </summary>
public interface IAuthSessionIssuer
{
    Task<AuthSession> IssueAsync(
        User user,
        string? sessionId,
        string? createdByIp,
        string? userAgent,
        CancellationToken cancellationToken);

    /// <summary>
    /// Rotates an existing session. Issues a new access+refresh pair tied to the same
    /// <paramref name="sessionId"/> so logout/revoke-all-in-session keeps working.
    /// </summary>
    Task<AuthSession> RotateAsync(
        User user,
        string sessionId,
        string? createdByIp,
        string? userAgent,
        CancellationToken cancellationToken);
}

public sealed record AuthSession(
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
