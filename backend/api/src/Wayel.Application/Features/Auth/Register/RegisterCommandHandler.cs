using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Auth.Register;

internal sealed class RegisterCommandHandler(
    IUserRepository users,
    IPasswordHasher passwordHasher,
    IAuthSessionIssuer sessionIssuer,
    IUnitOfWork unitOfWork,
    IClock clock)
    : ICommandHandler<RegisterCommand, AuthSession>
{
    public async Task<Result<AuthSession>> Handle(RegisterCommand request, CancellationToken cancellationToken)
    {
        if (await users.ExistsForEmailAsync(request.Email, cancellationToken))
        {
            return Result.Failure<AuthSession>(UserErrors.EmailTaken);
        }

        var passwordHash = passwordHasher.Hash(request.Password);
        var creation = User.Create(
            request.Email,
            passwordHash,
            request.DisplayName,
            request.Phone,
            destinationCountry: "SZ",
            clock.UtcNow);

        if (creation.IsFailure)
        {
            return Result.Failure<AuthSession>(creation.Error);
        }

        var user = creation.Value;
        await users.AddAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return await sessionIssuer.IssueAsync(
            user,
            sessionId: null,
            createdByIp: request.IpAddress,
            userAgent: request.UserAgent,
            cancellationToken);
    }
}
