namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// Long-term archive sink for terminal outbox rows (dispatched or
/// dead-lettered) that are about to age out of Mongo's TTL window.
///
/// The contract is intentionally batch-oriented and at-least-once:
///   - <see cref="ArchiveAsync"/> is called with a batch of messages that
///     the dispatcher has already settled. Implementations must persist
///     the batch durably before returning.
///   - The caller will mark rows as archived only on a successful return,
///     so transport failures simply replay on the next tick.
///   - Implementations MUST be safe to call concurrently from multiple
///     hosts — the worst case is duplicated archive entries, which the
///     downstream consumer (S3 + path keyed by message id, SIEM dedup,
///     etc.) is expected to deduplicate.
///
/// The default in-process implementation is <c>NullOutboxArchiveSink</c>
/// which keeps the dispatcher TTL-only behaviour (matches the current
/// production posture). Hosts that need long-term retention swap in a
/// real sink during composition.
/// </summary>
public interface IOutboxArchiveSink
{
    Task ArchiveAsync(
        IReadOnlyList<OutboxMessage> messages,
        CancellationToken cancellationToken = default);
}
