using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

/// <summary>
/// Mongo-backed implementation of <see cref="IOutboxMaintenance"/>.
///
/// Lives in its own type (not folded into <see cref="MongoOutboxStore"/>)
/// because the dispatcher's IOutboxStore contract should stay minimal —
/// nothing on the hot path needs a "requeue" verb. Keeping it separate
/// also means future maintenance ops (purge, force-DLQ, replay) accrete
/// here without bloating the store.
/// </summary>
internal sealed class MongoOutboxMaintenance(MongoContext context) : IOutboxMaintenance
{
    public async Task<OutboxRequeueOutcome> RequeueDeadLetterAsync(
        Guid messageId,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<OutboxMessageDocument>.Filter;

        // Conditional update: only flip the row back to pending if it's
        // *currently* dead-lettered AND not already dispatched. The
        // matched-count tells us the rest:
        //   - 1 match → we requeued it
        //   - 0 match + row exists → caller asked to requeue a healthy row
        //   - 0 match + row missing → unknown id
        //
        // Two conditions in the filter (not just DeadLetteredOnUtc) so we
        // never resurrect a successfully-dispatched message into the
        // pending queue and double-fire its handlers.
        var conditional = builder.And(
            builder.Eq(x => x.Id, messageId),
            builder.Ne(x => x.DeadLetteredOnUtc, (DateTime?)null),
            builder.Eq(x => x.DispatchedOnUtc, (DateTime?)null));

        var update = Builders<OutboxMessageDocument>.Update
            .Set(x => x.DeadLetteredOnUtc, (DateTime?)null)
            .Set(x => x.LastError, (string?)null)
            .Set(x => x.Attempts, 0);

        var result = await context.Outbox.UpdateOneAsync(
            conditional,
            update,
            cancellationToken: cancellationToken);

        if (result.MatchedCount == 1)
        {
            return OutboxRequeueOutcome.Requeued;
        }

        // Disambiguate the zero-match case with one quick existence probe.
        // We deliberately project no fields (`Limit(1).Any`) to keep this
        // cheap — operator endpoint, not hot path.
        var existsFilter = builder.Eq(x => x.Id, messageId);
        var exists = await context.Outbox
            .Find(existsFilter)
            .Limit(1)
            .Project<OutboxIdOnlyProjection>(
                Builders<OutboxMessageDocument>.Projection.Include(x => x.Id))
            .AnyAsync(cancellationToken);

        return exists ? OutboxRequeueOutcome.NotDeadLettered : OutboxRequeueOutcome.NotFound;
    }

    private sealed class OutboxIdOnlyProjection
    {
        public Guid Id { get; set; }
    }
}
