namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// Operator-only mutations on the outbox that aren't part of the
/// dispatcher's hot path. Kept separate from <see cref="IOutboxStore"/>
/// so the dispatcher's contract stays minimal — and separate from
/// <see cref="IOutboxInspector"/> because these calls *write*.
///
/// Today only "requeue" lives here; future ops (manual purge, force-
/// dead-letter, replay window) belong on this interface too.
/// </summary>
public interface IOutboxMaintenance
{
    /// <summary>
    /// Resurrect a dead-lettered message: clear <c>DeadLetteredOnUtc</c>,
    /// reset <c>Attempts</c> to zero, clear <c>LastError</c>, and leave
    /// <c>DispatchedOnUtc</c> untouched (still null). The dispatcher will
    /// pick the row up on its next poll.
    ///
    /// No-op (returns <see cref="OutboxRequeueOutcome.NotFound"/>) if the
    /// message id doesn't exist; explicit
    /// <see cref="OutboxRequeueOutcome.NotDeadLettered"/> when the row is
    /// alive (already pending or already dispatched) so the operator UI
    /// can show a precise reason rather than "nothing happened".
    /// </summary>
    Task<OutboxRequeueOutcome> RequeueDeadLetterAsync(
        Guid messageId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Outcome of a requeue attempt. Modelled as a discriminated enum (rather
/// than a bool) so the API can distinguish "you typed the wrong id" from
/// "this row was never dead-lettered" — both 4xx in HTTP terms but with
/// very different operator UX.
/// </summary>
public enum OutboxRequeueOutcome
{
    Requeued,
    NotFound,
    NotDeadLettered,
}
