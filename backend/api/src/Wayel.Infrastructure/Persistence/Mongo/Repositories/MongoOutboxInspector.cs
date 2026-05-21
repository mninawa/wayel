using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

/// <summary>
/// Read-side companion to <see cref="MongoOutboxStore"/>. Powers the
/// SuperAdmin "outbox health" endpoint without sharing collections logic
/// with the dispatch path.
///
/// All counts use Mongo's <c>countDocuments</c> against the existing
/// secondary indexes (<c>OccurredOnUtc</c>, <c>DispatchedOnUtc</c>,
/// <c>DeadLetteredOnUtc</c>) so the operation stays O(index) rather than
/// O(collection).
/// </summary>
internal sealed class MongoOutboxInspector(MongoContext context) : IOutboxInspector
{
    private const int LastErrorPreviewMaxLength = 200;

    public async Task<OutboxSnapshot> GetSnapshotAsync(
        DateTime nowUtc,
        TimeSpan dispatchedWindow,
        int recentDeadLetterLimit,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<OutboxMessageDocument>.Filter;

        // Pending: not dispatched AND not dead-lettered. Same predicate as
        // the dispatcher uses, which keeps the inspector aligned with what
        // the dispatcher will actually pick up next.
        var pendingFilter = builder.And(
            builder.Eq(x => x.DispatchedOnUtc, (DateTime?)null),
            builder.Eq(x => x.DeadLetteredOnUtc, (DateTime?)null));

        var dispatchedSinceFilter = builder.Gte(x => x.DispatchedOnUtc, nowUtc - dispatchedWindow);

        var deadLetterFilter = builder.Ne(x => x.DeadLetteredOnUtc, (DateTime?)null);

        var pendingTask = context.Outbox.CountDocumentsAsync(pendingFilter, cancellationToken: cancellationToken);
        var dispatchedTask = context.Outbox.CountDocumentsAsync(dispatchedSinceFilter, cancellationToken: cancellationToken);
        var dlqTask = context.Outbox.CountDocumentsAsync(deadLetterFilter, cancellationToken: cancellationToken);

        // Oldest pending row tells operators "the dispatcher is X minutes
        // behind". We project a single field so we don't pay for the payload.
        var oldestProjection = Builders<OutboxMessageDocument>.Projection
            .Include(x => x.OccurredOnUtc)
            .Exclude("_id");

        var oldestTask = context.Outbox
            .Find(pendingFilter)
            .Sort(Builders<OutboxMessageDocument>.Sort.Ascending(x => x.OccurredOnUtc))
            .Project<OutboxOccurredOnlyProjection>(oldestProjection)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken);

        var recentDlqTask = context.Outbox
            .Find(deadLetterFilter)
            .Sort(Builders<OutboxMessageDocument>.Sort.Descending(x => x.DeadLetteredOnUtc))
            .Limit(recentDeadLetterLimit)
            .ToListAsync(cancellationToken);

        await Task.WhenAll(pendingTask, dispatchedTask, dlqTask, oldestTask, recentDlqTask);

        var oldest = oldestTask.Result?.OccurredOnUtc;
        var recent = recentDlqTask.Result.Select(d => new DeadLetterPreview(
            d.Id,
            d.TypeName,
            d.OccurredOnUtc,
            d.DeadLetteredOnUtc!.Value,
            d.Attempts,
            Truncate(d.LastError, LastErrorPreviewMaxLength))).ToList();

        return new OutboxSnapshot(
            Pending: pendingTask.Result,
            DispatchedInWindow: dispatchedTask.Result,
            DeadLettered: dlqTask.Result,
            OldestPendingOccurredOnUtc: oldest,
            RecentDeadLetters: recent);
    }

    private static string? Truncate(string? value, int max)
    {
        if (value is null) return null;
        return value.Length <= max ? value : value[..max] + "…";
    }

    /// <summary>
    /// Tiny projection class so the oldest-pending query doesn't deserialise
    /// the full <see cref="OutboxMessageDocument"/> (which can carry large
    /// payloads).
    /// </summary>
    private sealed class OutboxOccurredOnlyProjection
    {
        public DateTime OccurredOnUtc { get; set; }
    }
}
