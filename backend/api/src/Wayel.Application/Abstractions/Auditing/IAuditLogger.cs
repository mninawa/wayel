namespace Wayel.Application.Abstractions.Auditing;

/// <summary>
/// Writes audit entries to durable storage. Implementations MUST be
/// best-effort: failure to persist an audit row must never block the
/// business operation that produced it (but should be logged loudly).
/// </summary>
public interface IAuditLogger
{
    Task WriteAsync(AuditEntry entry, CancellationToken cancellationToken = default);
}
