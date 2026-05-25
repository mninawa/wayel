namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Mutable holder for the live MoMo <c>ApiUser</c> / <c>ApiKey</c> pair.
///
/// <para>
/// <see cref="MtnMomoOptions"/> models the *declared* configuration (via
/// <see cref="Microsoft.Extensions.Configuration"/>) and is therefore immutable.
/// In sandbox we may have to mint the credentials at startup
/// (see <see cref="MtnMomoSandboxProvisioner"/>), so we read everything else
/// from options but the live <c>(ApiUser, ApiKey)</c> pair through this holder.
/// </para>
/// </summary>
internal sealed class MtnMomoRuntimeCredentials
{
    private readonly Lock _gate = new();
    private string _apiUser = string.Empty;
    private string _apiKey = string.Empty;

    public (string ApiUser, string ApiKey) Current
    {
        get
        {
            lock (_gate) { return (_apiUser, _apiKey); }
        }
    }

    public bool HasCredentials
    {
        get
        {
            lock (_gate) { return _apiUser.Length > 0 && _apiKey.Length > 0; }
        }
    }

    public void Set(string apiUser, string apiKey)
    {
        lock (_gate)
        {
            _apiUser = apiUser ?? string.Empty;
            _apiKey = apiKey ?? string.Empty;
        }
    }
}
