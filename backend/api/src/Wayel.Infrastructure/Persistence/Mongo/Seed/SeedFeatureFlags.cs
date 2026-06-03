using Microsoft.Extensions.Hosting;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Effective demo / test seed switches. Development hosts enable both by
/// default so local Docker and <c>dotnet run</c> work without extra env
/// vars; Production honours the explicit <c>Seed:*:Enabled</c> flags.
/// </summary>
public static class SeedFeatureFlags
{
    public static bool IsDemoDataEnabled(IHostEnvironment env, DemoDataOptions options) =>
        env.IsDevelopment() || options.Enabled;

    public static bool IsTestParcelsEnabled(IHostEnvironment env, TestParcelSeedOptions options) =>
        env.IsDevelopment() || options.Enabled;
}
