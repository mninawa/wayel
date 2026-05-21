using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Security;

public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    UserId? UserId { get; }
    UserRole Role { get; }
    string? Email { get; }
    string? DisplayName { get; }
}
