using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Wayel.Bff.Shared.Composition;

/// <summary>
/// Supplies Google's OIDC endpoints from a static snapshot (no discovery fetch
/// on login challenge) while refreshing signing keys from Google's JWKS endpoint
/// so <c>/signin-oidc</c> can validate id_token signatures.
/// </summary>
internal sealed class GoogleOidcHybridConfigurationManager : IConfigurationManager<OpenIdConnectConfiguration>
{
    private static readonly TimeSpan JwksRefreshInterval = TimeSpan.FromHours(12);
    private static readonly HttpClient JwksHttp = new() { Timeout = TimeSpan.FromSeconds(30) };

    private readonly OpenIdConnectConfiguration _static = GoogleOidcStaticConfiguration.Create();
    private readonly Lock _refreshLock = new();

    private JsonWebKeySet? _cachedJwks;
    private DateTime _jwksFetchedAtUtc;

    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel = default)
    {
        var config = new OpenIdConnectConfiguration
        {
            Issuer = _static.Issuer,
            AuthorizationEndpoint = _static.AuthorizationEndpoint,
            TokenEndpoint = _static.TokenEndpoint,
            UserInfoEndpoint = _static.UserInfoEndpoint,
            JwksUri = _static.JwksUri,
        };

        var jwks = await GetOrRefreshJwksAsync(cancel).ConfigureAwait(false);
        foreach (var key in jwks.GetSigningKeys())
        {
            config.SigningKeys.Add(key);
        }

        return config;
    }

    public void RequestRefresh()
    {
        _cachedJwks = null;
        _jwksFetchedAtUtc = DateTime.MinValue;
    }

    private async Task<JsonWebKeySet> GetOrRefreshJwksAsync(CancellationToken cancel)
    {
        if (_cachedJwks is not null
            && DateTime.UtcNow - _jwksFetchedAtUtc < JwksRefreshInterval)
        {
            return _cachedJwks;
        }

        lock (_refreshLock)
        {
            if (_cachedJwks is not null
                && DateTime.UtcNow - _jwksFetchedAtUtc < JwksRefreshInterval)
            {
                return _cachedJwks;
            }
        }

        var json = await JwksHttp.GetStringAsync(_static.JwksUri!, cancel).ConfigureAwait(false);
        var jwks = new JsonWebKeySet(json);
        lock (_refreshLock)
        {
            _cachedJwks = jwks;
            _jwksFetchedAtUtc = DateTime.UtcNow;
            return _cachedJwks;
        }
    }
}
