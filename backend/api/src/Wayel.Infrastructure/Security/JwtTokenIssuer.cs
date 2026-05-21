using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Security;

internal sealed class JwtTokenIssuer(IOptions<JwtOptions> options, IClock clock) : IJwtTokenIssuer
{
    private readonly JwtOptions _options = options.Value;

    public AccessToken Issue(UserId userId, UserRole role, string email, string displayName)
    {
        var now = clock.UtcNow;
        var expires = now.AddMinutes(_options.AccessTokenLifetimeMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.Value.ToString("D")),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Name, displayName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(JwtClaimTypes.Role, role.ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: creds);

        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
