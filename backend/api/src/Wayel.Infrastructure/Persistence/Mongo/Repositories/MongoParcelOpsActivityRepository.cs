using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelOpsActivityRepository(MongoContext context) : IParcelOpsActivityRepository
{
    public async Task AppendAsync(ParcelOpsActivityEvent activity, CancellationToken cancellationToken = default)
    {
        var doc = new ParcelOpsActivityDocument
        {
            Id = activity.Id,
            ParcelId = activity.ParcelId,
            EventType = activity.EventType,
            Title = activity.Title,
            Detail = activity.Detail,
            Actor = activity.Actor,
            OccurredAtUtc = activity.OccurredAtUtc,
        };
        await context.ParcelOpsActivity.InsertOneAsync(doc, cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyList<ParcelOpsActivityEvent>> ListForParcelAsync(
        ParcelId parcelId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var capped = Math.Clamp(limit, 1, 200);
        var docs = await context.ParcelOpsActivity
            .Find(x => x.ParcelId == parcelId)
            .SortByDescending(x => x.OccurredAtUtc)
            .Limit(capped)
            .ToListAsync(cancellationToken);

        return docs.Select(doc => new ParcelOpsActivityEvent(
            doc.Id,
            doc.ParcelId,
            doc.EventType,
            doc.Title,
            doc.Detail,
            doc.Actor,
            doc.OccurredAtUtc)).ToList();
    }
}
