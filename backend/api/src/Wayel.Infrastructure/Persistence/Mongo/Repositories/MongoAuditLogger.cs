using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Auditing;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

/// <summary>
/// Persists <see cref="AuditEntry"/> rows to the Mongo <c>audit_log</c>
/// collection. Writes are best-effort: if the collection is unavailable the
/// caller's operation still succeeds and the failure is logged.
/// </summary>
internal sealed class MongoAuditLogger(
    MongoContext context,
    ILogger<MongoAuditLogger> logger) : IAuditLogger
{
    public async Task WriteAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    {
        try
        {
            var doc = AuditLogDocument.FromEntry(entry);
            await context.AuditLog.InsertOneAsync(doc, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            // Never surface an audit-write failure to the caller — we'd rather
            // have a gap in the audit trail (loudly reported) than drop the
            // business operation.
            logger.LogError(
                ex,
                "Failed to write audit entry {Action} with outcome {Outcome}",
                entry.Action,
                entry.Outcome);
        }
    }
}
