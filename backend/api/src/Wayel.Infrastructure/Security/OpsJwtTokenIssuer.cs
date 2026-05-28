using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Infrastructure.Security;

internal sealed class OpsJwtTokenIssuer(
    IOptions<JwtOptions> jwtOptions,
    IOptions<OpsAuthOptions> opsAuthOptions,
    IClock clock) : IOpsJwtTokenIssuer
{
    private readonly JwtOptions _jwt = jwtOptions.Value;
    private readonly OpsAuthOptions _opsAuth = opsAuthOptions.Value;

    public AccessToken Issue(
        Guid opsUserId,
        string role,
        string email,
        string displayName,
        IReadOnlyList<string> regions)
    {
        var now = clock.UtcNow;
        var expires = now.AddMinutes(_jwt.AccessTokenLifetimeMinutes);
        var normalizedRole = role.Trim().ToLowerInvariant();
        var normalizedRegions = string.Join(',', regions);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, opsUserId.ToString("D")),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Name, displayName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(OpsAuthClaimTypes.Role, normalizedRole),
            new(OpsAuthClaimTypes.Regions, normalizedRegions),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SigningKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _opsAuth.JwtAudience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: creds);

        return new AccessToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
