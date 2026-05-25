using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Wayel.Bff.Shared.Configuration;

namespace Wayel.Bff.Shared.Composition;

/// <summary>
/// When enabled, seeds the OIDC handler with Google's public endpoints so
/// <see cref="OpenIdConnectHandler"/> does not call discovery on each challenge.
/// </summary>
internal sealed class GoogleOidcStaticMetadataPostConfigure(
    IConfiguration configuration,
    IHostEnvironment environment) : IPostConfigureOptions<OpenIdConnectOptions>
{
    public void PostConfigure(string? name, OpenIdConnectOptions options)
    {
        if (!string.Equals(name, OpenIdConnectDefaults.AuthenticationScheme, StringComparison.Ordinal))
        {
            return;
        }

        var useStatic = configuration.GetValue<bool?>($"{GoogleOidcOptions.SectionName}:UseStaticMetadata")
            ?? environment.IsDevelopment();
        if (!useStatic)
        {
            return;
        }

        // Do not assign options.Configuration alone — a static config without
        // SigningKeys causes IDX10500 on the /signin-oidc callback. The hybrid
        // manager keeps static endpoints but loads JWKS for validation.
        options.Configuration = null;
        options.ConfigurationManager = new GoogleOidcHybridConfigurationManager();
    }
}
