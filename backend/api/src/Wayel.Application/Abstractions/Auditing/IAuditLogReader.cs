namespace Wayel.Application.Abstractions.Auditing;

/// <summary>
/// Read-side counterpart to <see cref="IAuditLogger"/>. Splitting the
/// responsibilities keeps writers free of any query surface (no temptation
/// to widen the contract for one-off queries) and lets the read side evolve
/// independently — search indexes, replicas, etc.
/// </summary>
public interface IAuditLogReader
{
    Task<AuditLogPage> QueryAsync(AuditLogQuery query, CancellationToken cancellationToken = default);
}

/// <summary>
/// Inclusive lower bound, exclusive upper bound time window with optional
/// action / actor filters. <see cref="ContinuationToken"/> is the opaque
/// cursor returned by a previous page; callers should treat it as a black
/// box.
/// </summary>
public sealed record AuditLogQuery(
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    string? Action = null,
    string? ActorEmail = null,
    Guid? ActorUserId = null,
    AuditOutcome? Outcome = null,
    // TenantId: scope the query to a single tenant. Matches both the
    // first-class TenantId on entries written after the field existed AND
    // the legacy `metadata.tenant_id` string for entries written before.
    // Saves operators from having to guess which slot a given entry used.
    Guid? TenantId = null,
    int PageSize = 50,
    string? ContinuationToken = null);

public sealed record AuditLogPage(
    IReadOnlyList<AuditEntry> Items,
    string? NextContinuationToken);
