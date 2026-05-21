using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Sessions;

namespace Wayel.Application.Features.Auth.Logout;

internal sealed class LogoutCommandHandler(
    IRefreshTokenRepository refreshTokens,
    IUnitOfWork unitOfWork,
    IClock clock)
    : ICommandHandler<LogoutCommand>
{
    public async Task<Result> Handle(LogoutCommand request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            // Idempotent: logging out without a token is success.
            return Result.Success();
        }

        var hash = RefreshToken.HashToken(request.RefreshToken);
        var stored = await refreshTokens.GetByHashAsync(hash, cancellationToken);

        if (stored is not null)
        {
            await refreshTokens.RevokeSessionAsync(stored.SessionId, clock.UtcNow, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result.Success();
    }
}
