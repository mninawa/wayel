namespace Wayel.Application.Abstractions.Security;

public interface IOpsJwtTokenIssuer
{
    AccessToken Issue(
        Guid opsUserId,
        string role,
        string email,
        string displayName,
        IReadOnlyList<string> regions);
}
