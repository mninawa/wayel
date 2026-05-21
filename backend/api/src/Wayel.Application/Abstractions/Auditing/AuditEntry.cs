namespace Wayel.Application.Abstractions.Auditing;

/// <summary>
/// A single append-only record of "who did what, when, from where" for
/// security-relevant actions. Persisted exactly as written — there is no
/// update path.
///
/// Intended to be small and cheap: one write per action, with the minimum
/// structured context needed for after-the-fact incident response. Free-form
/// payloads go under <see cref="Metadata"/>.
/// </summary>
public sealed record AuditEntry
{
    public required string Action { get; init; }

    public required AuditOutcome Outcome { get; init; }

    public DateTime OccurredOnUtc { get; init; }

    public Guid? ActorUserId { get; init; }

    public string? ActorEmail { get; init; }

    /// <summary>
    /// Tenant the action targeted, if any. Set on tenant-scoped actions
    /// (tenant lifecycle, staff role / invitation flows, settings or
    /// branding edits) so the per-tenant audit filter on the read side
    /// can use a real index instead of probing free-form metadata.
    ///
    /// Null on platform-scope actions (auth, outbox maintenance).
    /// </summary>
    public Guid? TenantId { get; init; }

    /// <summary>
    /// Free-form audience descriptor, e.g. "Admin", "Client", "External". Kept
    /// as a string rather than an enum so non-SSO entries don't have to supply
    /// a value.
    /// </summary>
    public string? Audience { get; init; }

    public string? Ip { get; init; }

    public string? UserAgent { get; init; }

    /// <summary>
    /// Short machine-readable reason (e.g. an error code) on failed actions.
    /// </summary>
    public string? Reason { get; init; }

    public IReadOnlyDictionary<string, string?>? Metadata { get; init; }
}

public enum AuditOutcome
{
    Succeeded,
    Failed,
}
