using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoOutboxStore(MongoContext context) : IOutboxStore
{
    public async Task EnqueueAsync(
        IReadOnlyList<OutboxMessage> messages,
        CancellationToken cancellationToken = default)
    {
        if (messages.Count == 0) return;

        var docs = messages.Select(OutboxMessageDocument.FromMessage).ToList();
        await context.Outbox.InsertManyAsync(docs, cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyList<OutboxMessage>> GetPendingAsync(
        int batchSize,
        CancellationToken cancellationToken = default)
    {
        // Pending == not yet dispatched AND not dead-lettered. We keep both
        // filters explicit (rather than relying on a single $exists check)
        // so the intent is obvious to anyone reading the query.
        var builder = Builders<OutboxMessageDocument>.Filter;
        var filter = builder.And(
            builder.Eq(x => x.DispatchedOnUtc, (DateTime?)null),
            builder.Eq(x => x.DeadLetteredOnUtc, (DateTime?)null));

        var sort = Builders<OutboxMessageDocument>.Sort.Ascending(x => x.OccurredOnUtc);

        var docs = await context.Outbox
            .Find(filter)
            .Sort(sort)
            .Limit(batchSize)
            .ToListAsync(cancellationToken);

        return docs.Select(d => d.ToMessage()).ToList();
    }

    public async Task MarkDispatchedAsync(
        Guid messageId,
        DateTime dispatchedOnUtc,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<OutboxMessageDocument>.Filter.Eq(x => x.Id, messageId);
        var update = Builders<OutboxMessageDocument>.Update
            .Set(x => x.DispatchedOnUtc, dispatchedOnUtc)
            .Set(x => x.LastError, null)
            .Inc(x => x.Attempts, 1);

        await context.Outbox.UpdateOneAsync(filter, update, cancellationToken: cancellationToken);
    }

    public async Task RecordFailureAsync(
        Guid messageId,
        string error,
        DateTime nowUtc,
        int maxAttempts,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<OutboxMessageDocument>.Filter.Eq(x => x.Id, messageId);

        // Find-and-modify so we know the post-update attempt count, which
        // tells us whether this failure was the one that exhausted retries.
        var update = Builders<OutboxMessageDocument>.Update
            .Set(x => x.LastError, error)
            .Inc(x => x.Attempts, 1);

        var updated = await context.Outbox.FindOneAndUpdateAsync(
            filter,
            update,
            new FindOneAndUpdateOptions<OutboxMessageDocument>
            {
                ReturnDocument = ReturnDocument.After,
            },
            cancellationToken);

        if (updated is not null && updated.Attempts >= maxAttempts && updated.DeadLetteredOnUtc is null)
        {
            var dlqUpdate = Builders<OutboxMessageDocument>.Update
                .Set(x => x.DeadLetteredOnUtc, nowUtc);
            await context.Outbox.UpdateOneAsync(filter, dlqUpdate, cancellationToken: cancellationToken);
        }
    }

    public async Task<IReadOnlyList<OutboxMessage>> GetTerminalUnarchivedAsync(
        DateTime olderThanUtc,
        int batchSize,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<OutboxMessageDocument>.Filter;

        // Terminal == dispatched OR dead-lettered. We rely on the secondary
        // indexes on those columns plus the OccurredOnUtc ordering to keep
        // the scan bounded.
        var terminal = builder.Or(
            builder.Ne(x => x.DispatchedOnUtc, (DateTime?)null),
            builder.Ne(x => x.DeadLetteredOnUtc, (DateTime?)null));

        var unarchived = builder.Eq(x => x.ArchivedOnUtc, (DateTime?)null);

        var aged = builder.Lt(x => x.OccurredOnUtc, olderThanUtc);

        var filter = builder.And(terminal, unarchived, aged);

        var docs = await context.Outbox
            .Find(filter)
            .Sort(Builders<OutboxMessageDocument>.Sort.Ascending(x => x.OccurredOnUtc))
            .Limit(batchSize)
            .ToListAsync(cancellationToken);

        return docs.Select(d => d.ToMessage()).ToList();
    }

    public Task MarkArchivedAsync(
        IReadOnlyList<Guid> messageIds,
        DateTime archivedOnUtc,
        CancellationToken cancellationToken = default)
    {
        if (messageIds.Count == 0) return Task.CompletedTask;

        var filter = Builders<OutboxMessageDocument>.Filter.In(x => x.Id, messageIds);
        var update = Builders<OutboxMessageDocument>.Update.Set(x => x.ArchivedOnUtc, archivedOnUtc);
        return context.Outbox.UpdateManyAsync(filter, update, cancellationToken: cancellationToken);
    }
}
