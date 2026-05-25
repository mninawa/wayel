using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoShipmentCollectionRepository(MongoContext context) : IShipmentCollectionRepository
{
    public async Task<ShipmentCollectionRecord?> GetByShipmentIdAsync(
        Guid shipmentId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.ShipmentCollections
            .Find(x => x.ShipmentId == shipmentId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task UpsertAsync(ShipmentCollectionRecord record, CancellationToken cancellationToken = default)
    {
        var doc = ShipmentCollectionDocument.From(record);
        await context.ShipmentCollections.ReplaceOneAsync(
            x => x.ShipmentId == record.ShipmentId,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    public async Task<IReadOnlyList<ShipmentCollectionRecord>> ListByStatusesAsync(
        IReadOnlyList<string> statuses,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var safeLimit = Math.Clamp(limit, 1, 300);
        var filter = Builders<ShipmentCollectionDocument>.Filter.In(x => x.Status, statuses);
        var docs = await context.ShipmentCollections
            .Find(filter)
            .SortByDescending(x => x.UpdatedAtUtc)
            .Limit(safeLimit)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToRecord()).ToList();
    }

    public async Task<IReadOnlyList<ShipmentCollectionRecord>> SearchAsync(
        string query,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var trimmed = query.Trim();
        if (trimmed.Length == 0)
        {
            return [];
        }

        var safeLimit = Math.Clamp(limit, 1, 50);
        var pattern = trimmed;
        var filters = new List<FilterDefinition<ShipmentCollectionDocument>>
        {
            Builders<ShipmentCollectionDocument>.Filter.Regex(
                x => x.ShipmentDisplayId,
                new MongoDB.Bson.BsonRegularExpression(pattern, "i")),
            Builders<ShipmentCollectionDocument>.Filter.Regex(
                x => x.CustomerDisplayName,
                new MongoDB.Bson.BsonRegularExpression(pattern, "i")),
        };

        if (trimmed.All(char.IsDigit) && trimmed.Length <= 8)
        {
            filters.Add(Builders<ShipmentCollectionDocument>.Filter.Eq(x => x.SuiteNumber, trimmed));
        }

        if (Guid.TryParse(trimmed, out var shipmentId))
        {
            filters.Add(Builders<ShipmentCollectionDocument>.Filter.Eq(x => x.ShipmentId, shipmentId));
        }

        var filter = Builders<ShipmentCollectionDocument>.Filter.Or(filters);
        var docs = await context.ShipmentCollections
            .Find(filter)
            .SortByDescending(x => x.UpdatedAtUtc)
            .Limit(safeLimit)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToRecord()).ToList();
    }
}
