using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Sessions;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Security;

internal sealed class AuthSessionIssuer(
    IJwtTokenIssuer jwt,
    IRefreshTokenRepository refreshTokens,
    IClock clock,
    IOptions<AuthSessionOptions> options) : IAuthSessionIssuer
{
    private readonly TimeSpan _refreshLifetime = TimeSpan.FromMinutes(options.Value.RefreshTokenLifetimeMinutes);

    public Task<AuthSession> IssueAsync(
        User user,
        string? sessionId,
        string? createdByIp,
        string? userAgent,
        CancellationToken cancellationToken) =>
        BuildAsync(user, sessionId ?? NewSessionId(), createdByIp, userAgent, cancellationToken);

    public Task<AuthSession> RotateAsync(
        User user,
        string sessionId,
        string? createdByIp,
        string? userAgent,
        CancellationToken cancellationToken) =>
        BuildAsync(user, sessionId, createdByIp, userAgent, cancellationToken);

    private async Task<AuthSession> BuildAsync(
        User user,
        string sessionId,
        string? createdByIp,
        string? userAgent,
        CancellationToken cancellationToken)
    {
        var access = jwt.Issue(user.Id, user.Role, user.Email.Value, user.DisplayName);

        var rawRefresh = RefreshToken.GenerateRawToken();
        var refresh = RefreshToken.Issue(
            user.Id,
            rawRefresh,
            sessionId,
            clock.UtcNow,
            _refreshLifetime,
            createdByIp,
            userAgent);

        await refreshTokens.AddAsync(refresh, cancellationToken);

        return new AuthSession(
            access.Token,
            access.ExpiresOnUtc,
            rawRefresh,
            refresh.ExpiresOnUtc,
            sessionId,
            user.Id.Value,
            TenantId: null,
            user.Email.Value,
            user.DisplayName,
            user.Role.ToString());
    }

    private static string NewSessionId() => Guid.NewGuid().ToString("N");
}
