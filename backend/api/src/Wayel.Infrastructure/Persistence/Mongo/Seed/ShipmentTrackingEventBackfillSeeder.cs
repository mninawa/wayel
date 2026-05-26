using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.Tracking;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Backfills <c>shipment_tracking_events</c> for existing shipments that have no events yet.
/// </summary>
internal sealed class ShipmentTrackingEventBackfillSeeder(
    MongoContext context,
    IServiceScopeFactory scopeFactory,
    ILogger<ShipmentTrackingEventBackfillSeeder> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(ShipmentTrackingEventBackfillSeeder),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var parcels = scope.ServiceProvider.GetRequiredService<IParcelRepository>();
        var addresses = scope.ServiceProvider.GetRequiredService<ICustomerAddressRepository>();
        var events = scope.ServiceProvider.GetRequiredService<IShipmentTrackingEventRepository>();
        var writer = scope.ServiceProvider.GetRequiredService<ShipmentTrackingEventWriter>();

        var docs = await context.Shipments.Find(FilterDefinition<ShipmentDocument>.Empty)
            .ToListAsync(cancellationToken);

        var backfilled = 0;
        foreach (var doc in docs)
        {
            var shipment = doc.ToDomain();
            var shipmentId = shipment.Id;

            if (await events.ListForShipmentAsync(shipmentId, cancellationToken) is { Count: > 0 })
            {
                continue;
            }

            var shipmentParcels = await LoadParcels(parcels, shipment.ParcelIds, cancellationToken);
            var destination = await ResolveDestinationAsync(addresses, shipment.UserId, cancellationToken);

            await writer.BackfillFromStatusAsync(shipment, shipmentParcels, destination, cancellationToken);
            backfilled++;
        }

        if (backfilled > 0)
        {
            logger.LogInformation(
                "Backfilled shipment tracking events for {Count} shipment(s).",
                backfilled);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task<IReadOnlyList<Parcel>> LoadParcels(
        IParcelRepository parcels,
        IReadOnlyList<ParcelId> ids,
        CancellationToken cancellationToken)
    {
        var list = new List<Parcel>();
        foreach (var id in ids)
        {
            var p = await parcels.GetByIdAsync(id, cancellationToken);
            if (p is not null)
            {
                list.Add(p);
            }
        }

        return list;
    }

    private static async Task<string> ResolveDestinationAsync(
        ICustomerAddressRepository addresses,
        UserId userId,
        CancellationToken cancellationToken)
    {
        var all = await addresses.ListForUserAsync(userId, cancellationToken);
        var delivery = all.FirstOrDefault(a => a.IsDefault && !a.IsSuiteAddress)
            ?? all.FirstOrDefault(a => !a.IsSuiteAddress);

        if (delivery is null || string.IsNullOrWhiteSpace(delivery.City))
        {
            return "Eswatini";
        }

        return $"{delivery.City}, Eswatini";
    }
}
