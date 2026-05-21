using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Security;

public interface ISsoAdmissionPolicy
{
    Task<Result<SsoAdmissionDecision>> EvaluateAsync(
        SsoAudience audience,
        GoogleIdToken token,
        User? existingUser,
        CancellationToken cancellationToken);
}

public sealed record SsoAdmissionDecision(UserRole ProvisionRole, UserRole? PromoteToRole = null);
