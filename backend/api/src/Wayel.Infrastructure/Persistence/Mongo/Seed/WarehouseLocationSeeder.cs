using System.Globalization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Warehouse;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

internal sealed class WarehouseLocationSeeder(
    IServiceScopeFactory scopeFactory,
    ILogger<WarehouseLocationSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var locations = scope.ServiceProvider.GetRequiredService<IWarehouseLocationRepository>();

        var existing = await locations.ListByWarehouseAsync(WarehouseConstants.DefaultWarehouseId, cancellationToken);
        if (existing.Count > 0)
        {
            return;
        }

        logger.LogInformation("Seeding Midrand warehouse locations...");
        var now = DateTime.UtcNow;
        var seeds = new List<WarehouseLocationRecord>
        {
            MakeSpecial(WarehouseConstants.ReceivingBayLocationId, "RECEIVING", "HOLD_AREA", 50, 0, now),
            MakeSpecial(WarehouseConstants.PickingAreaLocationId, "PICKING", "PACKING_AREA", 100, 0, now),
            MakeSpecial(WarehouseConstants.PackingAreaLocationId, "PACKING", "PACKING_AREA", 50, 0, now),
            MakeSpecial(WarehouseConstants.DispatchStagingLocationId, "DISPATCH", "DISPATCH_AREA", 80, 0, now),
        };

        foreach (var (zone, aisle, shelf, bin, capacity, occupancy, storageType, status) in GridLocations())
        {
            var id = WarehouseConstants.FormatLocationId(zone, aisle, shelf, bin);
            seeds.Add(new WarehouseLocationRecord(
                id,
                WarehouseConstants.DefaultWarehouseId,
                zone,
                aisle,
                shelf,
                bin,
                capacity,
                occupancy,
                storageType,
                status,
                now));
        }

        foreach (var loc in seeds)
        {
            await locations.UpsertAsync(loc, cancellationToken);
        }

        logger.LogInformation("Seeded {Count} warehouse locations.", seeds.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static WarehouseLocationRecord MakeSpecial(
        string id,
        string zone,
        string status,
        int capacity,
        int occupancy,
        DateTime now) =>
        new(
            id,
            WarehouseConstants.DefaultWarehouseId,
            zone,
            zone,
            "00",
            "00",
            capacity,
            occupancy,
            "Standard",
            status,
            now);

    private static IEnumerable<(string Zone, string Aisle, string Shelf, string Bin, int Capacity, int Occupancy, string StorageType, string Status)> GridLocations()
    {
        yield return ("A", "A1", "02", "03", 25, 18, "Standard", WarehouseLocationStatuses.Active);
        yield return ("A", "A1", "02", "04", 25, 21, "Standard", WarehouseLocationStatuses.Full);
        yield return ("A", "A1", "03", "01", 15, 9, "Fragile", WarehouseLocationStatuses.Active);
        yield return ("B", "B1", "01", "07", 10, 4, "Oversized", WarehouseLocationStatuses.Active);
        yield return ("B", "B2", "01", "02", 20, 12, "Standard", WarehouseLocationStatuses.Active);

        for (var shelf = 1; shelf <= 3; shelf++)
        {
            for (var bin = 1; bin <= 4; bin++)
            {
                var occupancy = (shelf + bin) % 5;
                yield return (
                    "C",
                    "C1",
                    shelf.ToString("00", CultureInfo.InvariantCulture),
                    bin.ToString("00", CultureInfo.InvariantCulture),
                    15,
                    occupancy,
                    "Standard",
                    occupancy >= 15 ? WarehouseLocationStatuses.Full : WarehouseLocationStatuses.Active);
            }
        }
    }
}
