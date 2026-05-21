namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// Read-only operator surface over the transactional outbox. Kept separate
/// from <see cref="IOutboxStore"/> so the dispatcher's contract stays tight
/// and the inspector can grow query shapes (filtering, paging) without
/// affecting the hot dispatch path.
/// </summary>
public interface IOutboxInspector
{
    /// <summary>
    /// Aggregate counts plus a small recent-DLQ window — enough to power a
    /// single dashboard tile without paging.
    /// </summary>
    Task<OutboxSnapshot> GetSnapshotAsync(
        DateTime nowUtc,
        TimeSpan dispatchedWindow,
        int recentDeadLetterLimit,
        CancellationToken cancellationToken = default);
}

public sealed record OutboxSnapshot(
    long Pending,
    long DispatchedInWindow,
    long DeadLettered,
    DateTime? OldestPendingOccurredOnUtc,
    IReadOnlyList<DeadLetterPreview> RecentDeadLetters);

public sealed record DeadLetterPreview(
    Guid MessageId,
    string TypeName,
    DateTime OccurredOnUtc,
    DateTime DeadLetteredOnUtc,
    int Attempts,
    // LastErrorPreview: truncated to a small length (typically 200 chars)
    // to keep the inspector cheap and avoid leaking entire stack traces
    // over the wire.
    string? LastErrorPreview);
