using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoShipmentRepository(MongoContext context, IDomainEventCollector events) : IShipmentRepository
{
    public async Task<Shipment?> GetByIdAsync(ShipmentId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Shipments.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<IReadOnlyList<Shipment>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var docs = await context.Shipments
            .Find(x => x.UserId == userId)
            .SortByDescending(x => x.Id)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<Shipment>> ListActiveForOpsAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        var active = new[]
        {
            ShipmentStatus.Quoted,
            ShipmentStatus.AwaitingApproval,
            ShipmentStatus.Paid,
            ShipmentStatus.InTransit,
        };

        var filter = Builders<ShipmentDocument>.Filter.In(x => x.Status, active);
        var docs = await context.Shipments
            .Find(filter)
            .SortByDescending(x => x.Id)
            .Limit(Math.Clamp(limit, 1, 200))
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<OpsShipmentPage> ListByStatusPageAsync(
        ShipmentStatus status,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var safePage = Math.Max(1, page);
        var safeSize = Math.Clamp(pageSize, 1, 100);
        var skip = (safePage - 1) * safeSize;
        var filter = Builders<ShipmentDocument>.Filter.Eq(x => x.Status, status);
        var total = (int)await context.Shipments.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var docs = await context.Shipments
            .Find(filter)
            .SortByDescending(x => x.Id)
            .Skip(skip)
            .Limit(safeSize)
            .ToListAsync(cancellationToken);
        return new OpsShipmentPage(docs.Select(d => d.ToDomain()).ToList(), total);
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
