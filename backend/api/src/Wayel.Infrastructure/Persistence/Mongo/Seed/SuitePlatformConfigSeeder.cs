using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

internal sealed class SuitePlatformConfigSeeder(
    IServiceScopeFactory scopeFactory,
    ILogger<SuitePlatformConfigSeeder> logger) : IHostedService
{
    private const string LegacyAddressLine1 =
        "Shoprite Checkers Crowthorne, Cnr Old Pretoria Road & Crowthorne Drive, Crowthorne";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<ISuitePlatformConfigRepository>();
        var addresses = scope.ServiceProvider.GetRequiredService<ICustomerAddressRepository>();

        var seeded = 0;
        var migrated = 0;
        foreach (var region in SuitePlatformRegions.Supported)
        {
            var defaults = SuitePlatformSettings.ForRegion(region);
            var existing = await repository.GetByRegionAsync(region, cancellationToken);
            if (existing is null)
            {
                await repository.SaveAsync(defaults, cancellationToken);
                seeded++;
                continue;
            }

            if (!IsLegacyWarehouseAddress(existing))
            {
                continue;
            }

            var updated = defaults with
            {
                TotalSuiteCapacity = existing.TotalSuiteCapacity,
                NumberPrefix = existing.NumberPrefix,
                GenerationMode = existing.GenerationMode,
                UserIdSuffixLength = existing.UserIdSuffixLength,
                SequencePadLength = existing.SequencePadLength,
                NextSequenceNumber = existing.NextSequenceNumber,
                IsActive = existing.IsActive,
            };

            await repository.SaveAsync(updated, cancellationToken);
            await SuitePlatformWarehouseAddressSync.SyncStoredSuiteAddressesAsync(
                addresses,
                updated,
                cancellationToken);
            migrated++;
        }

        if (seeded > 0)
        {
            logger.LogInformation("Seeded suite platform configuration for {Count} region(s).", seeded);
        }

        if (migrated > 0)
        {
            logger.LogInformation(
                "Migrated legacy Crowthorne warehouse address to Sandton for {Count} region(s).",
                migrated);
        }
    }

    private static bool IsLegacyWarehouseAddress(SuitePlatformSettings settings) =>
        string.Equals(settings.AddressLine1, LegacyAddressLine1, StringComparison.Ordinal)
        || settings.AddressLine1.Contains("Crowthorne", StringComparison.OrdinalIgnoreCase)
        || string.Equals(settings.City, "Midrand", StringComparison.OrdinalIgnoreCase);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
