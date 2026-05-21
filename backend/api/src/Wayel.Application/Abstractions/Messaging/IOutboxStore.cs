namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// Transactional outbox for domain events. Messages enqueued here are
/// guaranteed to be dispatched at least once by the background dispatcher.
/// Dispatch is idempotent at the dispatcher level (we track
/// <c>DispatchedOnUtc</c>), so handlers downstream must be idempotent too.
/// </summary>
public interface IOutboxStore
{
    Task EnqueueAsync(
        IReadOnlyList<OutboxMessage> messages,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OutboxMessage>> GetPendingAsync(
        int batchSize,
        CancellationToken cancellationToken = default);

    Task MarkDispatchedAsync(
        Guid messageId,
        DateTime dispatchedOnUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Records a dispatch failure. Implementations bump the attempt counter
    /// and persist the latest error. Once <paramref name="maxAttempts"/> is
    /// reached the row is dead-lettered (excluded from future polls) so the
    /// dispatcher stops spinning on poison messages.
    /// </summary>
    Task RecordFailureAsync(
        Guid messageId,
        string error,
        DateTime nowUtc,
        int maxAttempts,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads a batch of terminal (dispatched OR dead-lettered) rows that have
    /// not yet been archived and whose <c>OccurredOnUtc</c> is older than
    /// <paramref name="olderThanUtc"/>. Used by the archive hosted service
    /// to ship rows to long-term storage before Mongo's TTL evicts them.
    ///
    /// The returned messages still live in the store — call
    /// <see cref="MarkArchivedAsync"/> after a successful sink to suppress
    /// re-shipment on the next tick.
    /// </summary>
    Task<IReadOnlyList<OutboxMessage>> GetTerminalUnarchivedAsync(
        DateTime olderThanUtc,
        int batchSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Stamps the given rows as archived. Called by the archive hosted
    /// service after the sink has confirmed durable persistence.
    /// </summary>
    Task MarkArchivedAsync(
        IReadOnlyList<Guid> messageIds,
        DateTime archivedOnUtc,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Serialized domain event ready for durable storage. Carries the full
/// outbox lifecycle so consumers (dispatcher, inspector, archive sink)
/// can branch on terminal state without a second round-trip.
/// </summary>
public sealed record OutboxMessage(
    Guid Id,
    string TypeName,
    string AssemblyQualifiedName,
    string Payload,
    DateTime OccurredOnUtc,
    int Attempts = 0,
    DateTime? DispatchedOnUtc = null,
    string? LastError = null,
    DateTime? DeadLetteredOnUtc = null,
    DateTime? ArchivedOnUtc = null);
