using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Security;

/// <summary>WeYell customer portal — open Google SSO auto-provision as <see cref="UserRole.Customer"/>.</summary>
internal sealed class ConfigBackedSsoAdmissionPolicy(ILogger<ConfigBackedSsoAdmissionPolicy> logger)
    : ISsoAdmissionPolicy
{
    public Task<Result<SsoAdmissionDecision>> EvaluateAsync(
        SsoAudience audience,
        GoogleIdToken token,
        User? existingUser,
        CancellationToken cancellationToken)
    {
        if (audience is not (SsoAudience.External or SsoAudience.Client))
        {
            logger.LogWarning("SSO denied for {Email}: audience {Audience} is not permitted.", token.Email, audience);
            return Task.FromResult(Result.Failure<SsoAdmissionDecision>(IdentityErrors.AudienceNotPermitted));
        }

        if (existingUser is { IsDisabled: true })
        {
            return Task.FromResult(Result.Failure<SsoAdmissionDecision>(UserErrors.Disabled));
        }

        return Task.FromResult<Result<SsoAdmissionDecision>>(
            new SsoAdmissionDecision(UserRole.Customer));
    }
}
