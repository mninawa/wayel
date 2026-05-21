using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Security;

public interface IJwtTokenIssuer
{
    AccessToken Issue(UserId userId, UserRole role, string email, string displayName);
}

public sealed record AccessToken(string Token, DateTime ExpiresOnUtc);
