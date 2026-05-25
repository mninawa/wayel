using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Shipments;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoShipmentTrackingEventRepository(MongoContext context) : IShipmentTrackingEventRepository
{
    public async Task<IReadOnlyList<ShipmentTrackingEvent>> ListForShipmentAsync(
        ShipmentId shipmentId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.ShipmentTrackingEvents
            .Find(x => x.ShipmentId == shipmentId.Value)
            .SortBy(x => x.OccurredAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<bool> ExistsAsync(
        ShipmentId shipmentId,
        string eventType,
        CancellationToken cancellationToken = default)
    {
        return await context.ShipmentTrackingEvents
            .Find(x => x.ShipmentId == shipmentId.Value && x.EventType == eventType)
            .AnyAsync(cancellationToken);
    }

    public async Task AddAsync(ShipmentTrackingEvent trackingEvent, CancellationToken cancellationToken = default)
    {
        await context.ShipmentTrackingEvents.InsertOneAsync(
            ShipmentTrackingEventDocument.From(trackingEvent),
            cancellationToken: cancellationToken);
    }

    public async Task AddManyAsync(
        IEnumerable<ShipmentTrackingEvent> trackingEvents,
        CancellationToken cancellationToken = default)
    {
        var docs = trackingEvents.Select(ShipmentTrackingEventDocument.From).ToList();
        if (docs.Count == 0)
        {
            return;
        }

        await context.ShipmentTrackingEvents.InsertManyAsync(docs, cancellationToken: cancellationToken);
    }
}
