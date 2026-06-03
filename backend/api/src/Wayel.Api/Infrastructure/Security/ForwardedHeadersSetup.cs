using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

namespace Wayel.Api.Infrastructure.Security;

public sealed class ForwardedHeadersConfigurationOptions
{
    public const string SectionName = "ForwardedHeaders";

    public int ForwardLimit { get; init; } = 1;
    public string[] TrustedProxies { get; init; } = [];
    public string[] TrustedNetworks { get; init; } = [];
    public bool TrustAllProxies { get; init; }
}

public static class ForwardedHeadersSetup
{
    public static IServiceCollection AddWayelForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<ForwardedHeadersConfigurationOptions>(
            configuration.GetSection(ForwardedHeadersConfigurationOptions.SectionName));
        services.AddSingleton<IConfigureOptions<ForwardedHeadersOptions>, ApiForwardedHeadersConfigurer>();
        return services;
    }

    internal static void Apply(
        ForwardedHeadersConfigurationOptions cfg,
        ForwardedHeadersOptions options,
        ForwardedHeaders forwardedHeaders)
    {
        options.ForwardedHeaders = forwardedHeaders;
        options.ForwardLimit = cfg.ForwardLimit > 0 ? cfg.ForwardLimit : 1;

        if (cfg.TrustAllProxies)
        {
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            return;
        }

        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();

        foreach (var proxy in cfg.TrustedProxies)
        {
            if (string.IsNullOrWhiteSpace(proxy))
            {
                continue;
            }

            options.KnownProxies.Add(IPAddress.Parse(proxy.Trim()));
        }

        foreach (var network in cfg.TrustedNetworks)
        {
            if (string.IsNullOrWhiteSpace(network))
            {
                continue;
            }

            options.KnownIPNetworks.Add(global::System.Net.IPNetwork.Parse(network.Trim()));
        }
    }

    private sealed class ApiForwardedHeadersConfigurer(
        IOptions<ForwardedHeadersConfigurationOptions> cfg)
        : IConfigureOptions<ForwardedHeadersOptions>
    {
        public void Configure(ForwardedHeadersOptions options) =>
            Apply(
                cfg.Value,
                options,
                ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
    }
}
