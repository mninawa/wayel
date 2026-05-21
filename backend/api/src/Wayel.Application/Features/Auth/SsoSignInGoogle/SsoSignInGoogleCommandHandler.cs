using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Auth.SsoSignInGoogle;

internal sealed class SsoSignInGoogleCommandHandler(
    IGoogleIdTokenValidator googleValidator,
    IExternalIdentityRepository identities,
    IUserRepository users,
    IAuthSessionIssuer sessionIssuer,
    ISsoAdmissionPolicy admissionPolicy,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<SsoSignInGoogleCommandHandler> logger)
    : ICommandHandler<SsoSignInGoogleCommand, AuthSession>
{
    public async Task<Result<AuthSession>> Handle(SsoSignInGoogleCommand request, CancellationToken cancellationToken)
    {
        var validation = await googleValidator.ValidateAsync(request.IdToken, cancellationToken);
        if (validation.IsFailure)
        {
            return Result.Failure<AuthSession>(validation.Error);
        }

        var payload = validation.Value;
        if (!payload.EmailVerified)
        {
            return Result.Failure<AuthSession>(IdentityErrors.EmailNotVerified);
        }

        var nowUtc = clock.UtcNow;
        var existingLink = await identities.GetByProviderSubjectAsync(IdentityProvider.Google, payload.Subject, cancellationToken);

        User? user = null;
        if (existingLink is not null)
        {
            user = await users.GetByIdAsync(existingLink.UserId, cancellationToken);
            if (user is null)
            {
                return Result.Failure<AuthSession>(IdentityErrors.ProviderRejected);
            }
        }
        else
        {
            user = await users.GetByEmailAsync(payload.Email, cancellationToken);
        }

        var admission = await admissionPolicy.EvaluateAsync(request.Audience, payload, user, cancellationToken);
        if (admission.IsFailure)
        {
            return Result.Failure<AuthSession>(admission.Error);
        }

        if (existingLink is not null)
        {
            existingLink.UpdateProviderEmail(payload.Email);
            existingLink.RecordLogin(nowUtc);
            await identities.UpdateAsync(existingLink, cancellationToken);
        }
        else if (user is null)
        {
            var creation = User.CreateForSso(payload.Email, payload.Name ?? payload.Email, phone: null, nowUtc);
            if (creation.IsFailure)
            {
                return Result.Failure<AuthSession>(creation.Error);
            }

            user = creation.Value;
            await users.AddAsync(user, cancellationToken);

            var newLink = ExternalIdentity.Link(user.Id, IdentityProvider.Google, payload.Subject, payload.Email, nowUtc);
            if (newLink.IsFailure)
            {
                return Result.Failure<AuthSession>(newLink.Error);
            }

            newLink.Value.RecordLogin(nowUtc);
            await identities.AddAsync(newLink.Value, cancellationToken);
        }
        else if (!user.HasPasswordCredential)
        {
            var newLink = ExternalIdentity.Link(user.Id, IdentityProvider.Google, payload.Subject, payload.Email, nowUtc);
            if (newLink.IsFailure)
            {
                return Result.Failure<AuthSession>(newLink.Error);
            }

            newLink.Value.RecordLogin(nowUtc);
            await identities.AddAsync(newLink.Value, cancellationToken);
        }
        else
        {
            return Result.Failure<AuthSession>(IdentityErrors.LinkingNotPermitted);
        }

        user!.RecordLogin(nowUtc);
        await users.UpdateAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Google SSO sign-in for {Email}", payload.Email);

        return await sessionIssuer.IssueAsync(user, sessionId: null, createdByIp: request.IpAddress, userAgent: request.UserAgent, cancellationToken);
    }
}
