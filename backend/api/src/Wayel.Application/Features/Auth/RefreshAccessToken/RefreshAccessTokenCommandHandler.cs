using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Sessions;

namespace Wayel.Application.Features.Auth.RefreshAccessToken;

internal sealed class RefreshAccessTokenCommandHandler(
    IRefreshTokenRepository refreshTokens,
    IUserRepository users,
    IAuthSessionIssuer sessionIssuer,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<RefreshAccessTokenCommandHandler> logger)
    : ICommandHandler<RefreshAccessTokenCommand, AuthSession>
{
    public async Task<Result<AuthSession>> Handle(
        RefreshAccessTokenCommand request,
        CancellationToken cancellationToken)
    {
        var hash = RefreshToken.HashToken(request.RefreshToken);
        var stored = await refreshTokens.GetByHashAsync(hash, cancellationToken);

        if (stored is null)
        {
            return Result.Failure<AuthSession>(RefreshTokenErrors.NotFound);
        }

        var nowUtc = clock.UtcNow;

        if (stored.RevokedOnUtc is not null)
        {
            return Result.Failure<AuthSession>(RefreshTokenErrors.Revoked);
        }

        if (stored.IsExpired(nowUtc))
        {
            return Result.Failure<AuthSession>(RefreshTokenErrors.Expired);
        }

        if (stored.IsConsumed)
        {
            // Reuse of an already-rotated token => suspected theft. Burn the entire session.
            logger.LogWarning(
                "Refresh-token reuse detected for session {SessionId}, user {UserId}. Revoking all tokens in session.",
                stored.SessionId,
                stored.UserId.Value);

            await refreshTokens.RevokeSessionAsync(stored.SessionId, nowUtc, cancellationToken);
            return Result.Failure<AuthSession>(RefreshTokenErrors.Reused);
        }

        var user = await users.GetByIdAsync(stored.UserId, cancellationToken);
        if (user is null || user.IsDisabled)
        {
            stored.Revoke(nowUtc);
            await refreshTokens.UpdateAsync(stored, cancellationToken);
            return Result.Failure<AuthSession>(RefreshTokenErrors.Revoked);
        }

        var session = await sessionIssuer.RotateAsync(
            user,
            stored.SessionId,
            request.IpAddress,
            request.UserAgent,
            cancellationToken);

        // Mark the consumed token as replaced. We need to look up the new id by its hash.
        var newHash = RefreshToken.HashToken(session.RefreshToken);
        var newRow = await refreshTokens.GetByHashAsync(newHash, cancellationToken);
        if (newRow is not null)
        {
            stored.Consume(newRow.Id, nowUtc);
            await refreshTokens.UpdateAsync(stored, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return session;
    }
}
