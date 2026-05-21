namespace Wayel.Bff.Shared.Sessions;

/// <summary>
/// Plain-text shape of what the BFF stores in the encrypted auth-cookie payload.
/// Never leaves the server.
/// </summary>
public sealed record BffSession(
    string AccessToken,
    DateTime AccessTokenExpiresOnUtc,
    string RefreshToken,
    DateTime RefreshTokenExpiresOnUtc,
    string SessionId,
    Guid UserId,
    Guid? TenantId,
    string Email,
    string DisplayName,
    string Role)
{
    public bool AccessTokenExpiringWithin(TimeSpan window, DateTime nowUtc) =>
        AccessTokenExpiresOnUtc - nowUtc <= window;
}
