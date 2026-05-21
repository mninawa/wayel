extern alias WayelApi;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.MongoDb;
using ApiProgram = WayelApi::Program;

namespace Wayel.Bff.IntegrationTests.Infrastructure;

/// <summary>
/// Boots Wayel.Api against a one-shot Mongo container. Identical in spirit to the
/// factory in <c>Wayel.Api.IntegrationTests</c>; duplicated here because the alias
/// scoping that lets us own both <c>Wayel.Api.Program</c> and
/// <c>Wayel.Bff.Customer.Program</c> in one project means we can't safely consume the
/// API test project's types directly.
/// </summary>
public sealed class WayelApiFactory : WebApplicationFactory<ApiProgram>, IAsyncLifetime
{
    public const string TestSigningKey = "integration-test-signing-key-must-be-at-least-32-chars-long";
    public const string TestIssuer = "wayel-api-test";
    public const string TestAudience = "wayel-clients-test";

    private readonly MongoDbContainer _mongo = new MongoDbBuilder()
        .WithImage("mongo:7.0")
        .WithName($"wayel-bff-test-mongo-{Guid.NewGuid():N}")
        .Build();

    public string MongoConnectionString => _mongo.GetConnectionString();

    public async Task InitializeAsync() => await _mongo.StartAsync();

    public new async Task DisposeAsync()
    {
        await _mongo.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration(cfg =>
        {
            cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Mongo:ConnectionString"] = _mongo.GetConnectionString(),
                ["Mongo:DatabaseName"] = $"wayel_bfftest_{Guid.NewGuid():N}",
                ["Jwt:SigningKey"] = TestSigningKey,
                ["Jwt:Issuer"] = TestIssuer,
                ["Jwt:Audience"] = TestAudience,
                // The BFF round-trip tests seed sessions through password
                // login — a test-only escape hatch the API gates behind
                // Auth:EnablePasswordSignIn=false in production.
                ["Auth:EnablePasswordSignIn"] = "true",
                // Same reason as Wayel.Api.IntegrationTests: loopback IP
                // shared across the class fixture would otherwise share a
                // single per-IP auth bucket and 429 on longer suites.
                ["Auth:RateLimit:PermitLimit"] = "100000",
                ["Auth:RateLimit:WindowSeconds"] = "1",
                // Make outbox + archive quiet in BFF tests; they aren't the
                // unit under test here and slow Mongo container teardown.
                ["Outbox:Enabled"] = "false",
                // Billing/Paystack: ValidateOnStart in Infrastructure DI
                // would crash the host at boot if SecretKey is blank,
                // even for tests that never touch the billing surface.
                // Pin a deterministic test secret so the host always
                // starts; no live network calls are made — the BFF
                // round-trip tests don't drive the payment endpoints.
                ["Billing:Paystack:Enabled"] = "true",
                ["Billing:Paystack:SecretKey"] = "sk_test_wayel_bff_integration_test_paystack_secret",
                ["Billing:Paystack:ApiBaseUrl"] = "https://api.paystack.co",
                ["Billing:Paystack:Currency"] = "ZAR",
                ["Billing:Paystack:VerifyChargeMinorUnits"] = "100",
                ["Billing:Paystack:CallbackUrl"] = "http://localhost/me/payment-methods/added",
                ["Billing:Paystack:RefundVerifyCharge"] = "true",
                // Renewal ticker disabled in the BFF integration suite
                // for the same reason we disable it in
                // Wayel.Api.IntegrationTests: the ticker now drives a
                // real `IPaymentGateway` and we don't want a 30-second
                // background tick to call out to live Paystack while a
                // BFF round-trip test is running.
                ["Subscriptions:Ticker:Enabled"] = "false",
            });
        });
    }
}
