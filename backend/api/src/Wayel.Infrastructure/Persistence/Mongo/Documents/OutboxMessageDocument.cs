using MongoDB.Bson.Serialization.Attributes;
using Wayel.Application.Abstractions.Messaging;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

/// <summary>
/// Persisted form of an <see cref="OutboxMessage"/>. The document uses the
/// <see cref="OutboxMessage.Id"/> (a GUID) as its primary key so dispatches
/// and failure updates can locate the row with a single equality check.
/// </summary>
internal sealed class OutboxMessageDocument
{
    [BsonId]
    public Guid Id { get; set; }

    public string TypeName { get; set; } = string.Empty;

    public string AssemblyQualifiedName { get; set; } = string.Empty;

    public string Payload { get; set; } = string.Empty;

    public DateTime OccurredOnUtc { get; set; }

    public int Attempts { get; set; }

    [BsonIgnoreIfNull]
    public DateTime? DispatchedOnUtc { get; set; }

    [BsonIgnoreIfNull]
    public string? LastError { get; set; }

    /// <summary>
    /// Timestamp at which the dispatcher gave up on this message (attempt
    /// count exceeded <c>OutboxOptions.MaxAttempts</c>). Set together with a
    /// final <see cref="LastError"/>. Dead-lettered rows are retained until
    /// the configured retention window expires; they are never retried.
    /// </summary>
    [BsonIgnoreIfNull]
    public DateTime? DeadLetteredOnUtc { get; set; }

    /// <summary>
    /// Timestamp at which the archive hosted service shipped this row to
    /// the long-term sink. Set once the sink confirms durable persistence;
    /// rows with a non-null <c>ArchivedOnUtc</c> are excluded from the
    /// archive poll so we don't double-ship them.
    ///
    /// The TTL still evicts the row eventually based on
    /// <see cref="DispatchedOnUtc"/> / <see cref="DeadLetteredOnUtc"/>; the
    /// archive flag is purely a "we already handed this off" marker.
    /// </summary>
    [BsonIgnoreIfNull]
    public DateTime? ArchivedOnUtc { get; set; }

    public static OutboxMessageDocument FromMessage(OutboxMessage message) => new()
    {
        Id = message.Id,
        TypeName = message.TypeName,
        AssemblyQualifiedName = message.AssemblyQualifiedName,
        Payload = message.Payload,
        OccurredOnUtc = message.OccurredOnUtc,
        Attempts = message.Attempts,
        DispatchedOnUtc = message.DispatchedOnUtc,
        LastError = message.LastError,
    };

    public OutboxMessage ToMessage() => new(
        Id,
        TypeName,
        AssemblyQualifiedName,
        Payload,
        OccurredOnUtc,
        Attempts,
        DispatchedOnUtc,
        LastError,
        DeadLetteredOnUtc,
        ArchivedOnUtc);
}
