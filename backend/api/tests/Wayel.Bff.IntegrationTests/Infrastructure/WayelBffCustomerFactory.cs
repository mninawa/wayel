extern alias WayelBffCustomer;

using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using BffCustomerProgram = WayelBffCustomer::Program;

namespace Wayel.Bff.IntegrationTests.Infrastructure;

/// <summary>
/// Hosts <c>Wayel.Bff.Customer</c> in-process and rewires outbound API calls to
/// <see cref="WayelApiFactory"/> via an in-memory handler.
/// </summary>
public sealed class WayelBffCustomerFactory : WebApplicationFactory<BffCustomerProgram>
{
    private readonly WayelApiFactory _apiFactory;

    public WayelBffCustomerFactory(WayelApiFactory apiFactory)
    {
        _apiFactory = apiFactory;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration(cfg =>
        {
            cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Bff:Audience"] = "customer",
                ["Bff:SpaBaseUri"] = "http://localhost:4200",
                ["Bff:ApiBaseUri"] = "http://localhost:5099",
                ["Bff:CookieName"] = ".Wayel.Bff.Customer.Test",
                ["Bff:RequireHttpsCookie"] = "false",
                ["Bff:RefreshIfExpiringWithinSeconds"] = "60",
                ["GoogleOidc:ClientId"] = "test-client-id.apps.googleusercontent.com",
                ["GoogleOidc:ClientSecret"] = "test-client-secret",
            });
        });

        builder.ConfigureServices(services =>
        {
            services.AddHttpClient<global::Wayel.Bff.Shared.ApiClient.WayelAuthApiClient>()
                .ConfigurePrimaryHttpMessageHandler(() => _apiFactory.Server.CreateHandler());

            services.PostConfigure<OpenIdConnectOptions>(_ => { });
            services.AddSingleton<Microsoft.Extensions.Options.IPostConfigureOptions<OpenIdConnectOptions>>(
                new NoOidcDiscoveryPostConfigure());

            services.AddSingleton<IStartupFilter, BffTestSignInStartupFilter>();
        });
    }

    public HttpClient CreateBffClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        HandleCookies = true,
        BaseAddress = new Uri("http://localhost"),
    });

    private sealed class NoOidcDiscoveryPostConfigure
        : Microsoft.Extensions.Options.IPostConfigureOptions<OpenIdConnectOptions>
    {
        public void PostConfigure(string? name, OpenIdConnectOptions options)
        {
            options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(
                new OpenIdConnectConfiguration());
        }
    }
}
