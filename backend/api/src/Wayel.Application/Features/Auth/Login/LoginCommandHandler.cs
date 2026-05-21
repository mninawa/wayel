using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Auth.Login;

internal sealed class LoginCommandHandler(
    IUserRepository users,
    IPasswordHasher passwordHasher,
    IAuthSessionIssuer sessionIssuer,
    IUnitOfWork unitOfWork,
    IClock clock)
    : ICommandHandler<LoginCommand, AuthSession>
{
    public async Task<Result<AuthSession>> Handle(LoginCommand request, CancellationToken cancellationToken)
    {
        var user = await users.GetByEmailAsync(request.Email, cancellationToken);
        if (user is null)
        {
            return UserErrors.InvalidCredentials;
        }

        var authResult = user.Authenticate(hash => passwordHasher.Verify(request.Password, hash), clock.UtcNow);
        if (authResult.IsFailure)
        {
            return Result.Failure<AuthSession>(authResult.Error);
        }

        await users.UpdateAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return await sessionIssuer.IssueAsync(
            user,
            sessionId: null,
            createdByIp: request.IpAddress,
            userAgent: request.UserAgent,
            cancellationToken);
    }
}
