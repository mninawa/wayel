using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Users;

namespace Wayel.Api.Infrastructure;

internal sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public UserId? UserId =>
        TryGet(JwtRegisteredClaimNames.Sub, out var raw) && Guid.TryParse(raw, out var id)
            ? new UserId(id)
            : null;

    public UserRole Role =>
        TryGet(JwtClaimTypes.Role, out var raw) && Enum.TryParse<UserRole>(raw, out var role)
            ? role
            : UserRole.Unknown;

    public string? Email => TryGet(JwtRegisteredClaimNames.Email, out var raw) ? raw : null;

    public string? DisplayName => TryGet(JwtRegisteredClaimNames.Name, out var raw) ? raw : null;

    private bool TryGet(string type, out string value)
    {
        var claim = Principal?.FindFirst(type);
        value = claim?.Value ?? string.Empty;
        return claim is not null;
    }
}
