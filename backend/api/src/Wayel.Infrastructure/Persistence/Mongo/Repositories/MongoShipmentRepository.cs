using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Shipments;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoShipmentRepository(MongoContext context, IDomainEventCollector events) : IShipmentRepository
{
    public async Task<Shipment?> GetByIdAsync(ShipmentId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Shipments.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task AddAsync(Shipment shipment, CancellationToken cancellationToken = default)
    {
        await context.Shipments.InsertOneAsync(ShipmentDocument.From(shipment), cancellationToken: cancellationToken);
        events.CollectFrom(shipment);
    }

    public async Task UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default)
    {
        await context.Shipments.ReplaceOneAsync(x => x.Id == shipment.Id, ShipmentDocument.From(shipment), cancellationToken: cancellationToken);
        events.CollectFrom(shipment);
    }
}
