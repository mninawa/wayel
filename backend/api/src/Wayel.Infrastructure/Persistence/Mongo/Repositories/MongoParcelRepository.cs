using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelRepository(MongoContext context, IDomainEventCollector events) : IParcelRepository
{
    public async Task<IReadOnlyList<Parcel>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var docs = await context.Parcels.Find(x => x.UserId == userId).SortByDescending(x => x.ReceivedAtUtc).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<Parcel>> ListRecentAsync(int limit, CancellationToken cancellationToken = default) =>
        await ListRecentPageAsync(skip: 0, limit, cancellationToken);

    public async Task<IReadOnlyList<Parcel>> ListRecentPageAsync(
        int skip,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var capped = Math.Clamp(limit, 1, 500);
        var offset = Math.Max(0, skip);
        var docs = await context.Parcels
            .Find(FilterDefinition<ParcelDocument>.Empty)
            .SortByDescending(x => x.ReceivedAtUtc)
            .Skip(offset)
            .Limit(capped)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<Parcel?> GetByIdAsync(ParcelId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Parcels.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task AddAsync(Parcel parcel, CancellationToken cancellationToken = default)
    {
        await context.Parcels.InsertOneAsync(ParcelDocument.From(parcel), cancellationToken: cancellationToken);
        events.CollectFrom(parcel);
    }

    public async Task UpdateAsync(Parcel parcel, CancellationToken cancellationToken = default)
    {
        var filter = Builders<ParcelDocument>.Filter.Eq(x => x.Id, parcel.Id);
        await context.Parcels.ReplaceOneAsync(filter, ParcelDocument.From(parcel), cancellationToken: cancellationToken);
        events.CollectFrom(parcel);
    }
}
