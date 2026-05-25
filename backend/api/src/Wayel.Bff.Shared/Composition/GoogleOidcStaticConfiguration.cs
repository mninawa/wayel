using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace Wayel.Bff.Shared.Composition;

/// <summary>
/// Well-known Google OIDC endpoints so Development hosts do not need to
/// fetch <c>/.well-known/openid-configuration</c> on every login challenge
/// (avoids failures when Docker DNS is flaky).
/// </summary>
internal static class GoogleOidcStaticConfiguration
{
    public static OpenIdConnectConfiguration Create() =>
        new()
        {
            Issuer = "https://accounts.google.com",
            AuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth",
            TokenEndpoint = "https://oauth2.googleapis.com/token",
            UserInfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo",
            JwksUri = "https://www.googleapis.com/oauth2/v3/certs",
        };
}
