using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Wayel.Bff.Shared.Infrastructure;

public sealed class ForwardedHeadersConfigurationOptions
{
    public const string SectionName = "ForwardedHeaders";

    /// <summary>How many proxy hops to trust in X-Forwarded-* (default 1).</summary>
    public int ForwardLimit { get; init; } = 1;

    /// <summary>Individual proxy IPs (e.g. 127.0.0.1 for colocated nginx).</summary>
    public string[] TrustedProxies { get; init; } = [];

    /// <summary>CIDR ranges for upstream load balancers (e.g. Render internal nets).</summary>
    public string[] TrustedNetworks { get; init; } = [];

    /// <summary>
    /// When true, trust any X-Forwarded-* sender. Use only in Development / tests.
    /// </summary>
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
        services.AddSingleton<IConfigureOptions<ForwardedHeadersOptions>, BffForwardedHeadersConfigurer>();
        return services;
    }

    public static WebApplication UseWayelForwardedHeaders(this WebApplication app)
    {
        app.UseForwardedHeaders();
        return app;
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

    private sealed class BffForwardedHeadersConfigurer(
        IOptions<ForwardedHeadersConfigurationOptions> cfg)
        : IConfigureOptions<ForwardedHeadersOptions>
    {
        public void Configure(ForwardedHeadersOptions options) =>
            Apply(
                cfg.Value,
                options,
                ForwardedHeaders.XForwardedFor
                    | ForwardedHeaders.XForwardedProto
                    | ForwardedHeaders.XForwardedHost);
    }
}
