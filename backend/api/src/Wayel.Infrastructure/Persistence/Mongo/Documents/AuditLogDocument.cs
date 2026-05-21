using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using Wayel.Application.Abstractions.Auditing;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class AuditLogDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    public string Action { get; set; } = string.Empty;

    public string Outcome { get; set; } = string.Empty;

    public DateTime OccurredOnUtc { get; set; }

    public Guid? ActorUserId { get; set; }

    public string? ActorEmail { get; set; }

    /// <summary>Tenant the action targeted. Null on platform-scope rows.
    /// Populated since the per-tenant audit filter landed; legacy rows
    /// will deserialise to <c>null</c> here and be matched via the
    /// <see cref="Metadata"/> fallback in the reader.</summary>
    public Guid? TenantId { get; set; }

    public string? Audience { get; set; }

    public string? Ip { get; set; }

    public string? UserAgent { get; set; }

    public string? Reason { get; set; }

    [BsonIgnoreIfNull]
    public Dictionary<string, string?>? Metadata { get; set; }

    public static AuditLogDocument FromEntry(AuditEntry entry) => new()
    {
        Action = entry.Action,
        Outcome = entry.Outcome.ToString(),
        OccurredOnUtc = entry.OccurredOnUtc,
        ActorUserId = entry.ActorUserId,
        ActorEmail = entry.ActorEmail,
        TenantId = entry.TenantId,
        Audience = entry.Audience,
        Ip = entry.Ip,
        UserAgent = entry.UserAgent,
        Reason = entry.Reason,
        Metadata = entry.Metadata is null
            ? null
            : new Dictionary<string, string?>(entry.Metadata),
    };

    public AuditEntry ToEntry() => new()
    {
        Action = Action,
        Outcome = Enum.TryParse<AuditOutcome>(Outcome, ignoreCase: true, out var parsed)
            ? parsed
            : AuditOutcome.Failed,
        OccurredOnUtc = OccurredOnUtc,
        ActorUserId = ActorUserId,
        ActorEmail = ActorEmail,
        TenantId = TenantId,
        Audience = Audience,
        Ip = Ip,
        UserAgent = UserAgent,
        Reason = Reason,
        Metadata = Metadata,
    };
}
