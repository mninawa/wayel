using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Wayel.Application.Configuration;
using Wayel.Infrastructure.Security;

namespace Wayel.Api.Infrastructure;

/// <summary>
/// Wires JwtBearerOptions from <see cref="JwtOptions"/> via the IConfigureOptions pattern,
/// so we never have to call <c>BuildServiceProvider</c> from <c>Program.cs</c>.
/// </summary>
internal sealed class JwtBearerOptionsSetup(
    IOptions<JwtOptions> jwtOptions,
    IOptions<OpsAuthOptions> opsAuthOptions)
    : IConfigureNamedOptions<JwtBearerOptions>
{
    private readonly JwtOptions _jwt = jwtOptions.Value;
    private readonly OpsAuthOptions _opsAuth = opsAuthOptions.Value;

    public void Configure(JwtBearerOptions options) => Configure(JwtBearerDefaults.AuthenticationScheme, options);

    public void Configure(string? name, JwtBearerOptions options)
    {
        if (name != JwtBearerDefaults.AuthenticationScheme)
        {
            return;
        }

        // Keep inbound claim types verbatim. The default true would rename
        // short JWT claim names (notably "role") to the legacy SOAP URIs
        // (e.g. http://schemas.microsoft.com/ws/2008/06/identity/claims/role),
        // which would silently break every policy that calls
        // ClaimsPrincipal.FindFirst("role").
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = _jwt.Issuer,
            ValidAudiences = [_jwt.Audience, _opsAuth.JwtAudience],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SigningKey)),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    }
}
