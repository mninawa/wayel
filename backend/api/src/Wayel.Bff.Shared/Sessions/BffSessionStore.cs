using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Wayel.Bff.Shared.Sessions;

/// <summary>
/// Reads/writes the <see cref="BffSession"/> from the cookie-auth ticket. The session blob
/// is symmetrically encrypted by ASP.NET Data Protection so the cookie itself stays opaque.
/// </summary>
public sealed class BffSessionStore
{
    private const string SessionClaimType = "wayel.session";
    private const string DataProtectionPurpose = "Wayel.Bff.Session.v1";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IDataProtector _protector;
    private readonly ILogger<BffSessionStore> _logger;

    public BffSessionStore(IDataProtectionProvider provider, ILogger<BffSessionStore> logger)
    {
        _protector = provider.CreateProtector(DataProtectionPurpose);
        _logger = logger;
    }

    public ClaimsPrincipal BuildPrincipal(BffSession session, string scheme)
    {
        var protectedBlob = _protector.Protect(JsonSerializer.Serialize(session, JsonOptions));

        var identity = new ClaimsIdentity(scheme, ClaimTypes.NameIdentifier, ClaimTypes.Role);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, session.UserId.ToString("D")));
        identity.AddClaim(new Claim(ClaimTypes.Email, session.Email));
        identity.AddClaim(new Claim(ClaimTypes.Name, session.DisplayName));
        identity.AddClaim(new Claim(ClaimTypes.Role, session.Role));
        if (session.TenantId is { } tid)
        {
            identity.AddClaim(new Claim("tid", tid.ToString("D")));
        }

        identity.AddClaim(new Claim(SessionClaimType, protectedBlob));
        return new ClaimsPrincipal(identity);
    }

    public bool TryRead(ClaimsPrincipal principal, out BffSession session)
    {
        session = default!;
        var blob = principal.FindFirstValue(SessionClaimType);
        if (string.IsNullOrEmpty(blob))
        {
            return false;
        }

        try
        {
            var json = _protector.Unprotect(blob);
            var parsed = JsonSerializer.Deserialize<BffSession>(json, JsonOptions);
            if (parsed is null)
            {
                return false;
            }

            session = parsed;
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to decrypt BFF session blob; treating as anonymous.");
            return false;
        }
    }

    /// <summary>
    /// Replaces the session blob inside an already-signed-in principal. Used after a refresh-token rotation.
    /// </summary>
    public async Task UpdateAsync(HttpContext http, BffSession updated)
    {
        var auth = await http.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        if (auth.Principal is null || auth.Properties is null)
        {
            return;
        }

        var newPrincipal = BuildPrincipal(updated, auth.Principal.Identity?.AuthenticationType
            ?? CookieAuthenticationDefaults.AuthenticationScheme);

        await http.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            newPrincipal,
            auth.Properties);
    }
}
