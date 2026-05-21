using System.Text.Json;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Mongo-side implementation of <see cref="IUnitOfWork"/>.
///
/// The per-document writes themselves still happen inside the repository
/// methods (Mongo gives us atomic per-document writes out of the box, and
/// we don't require cross-document transactions today). What the UoW owns
/// is the <em>event publication</em> side: it drains the request-scoped
/// <see cref="IDomainEventCollector"/> and enqueues any accumulated domain
/// events into the outbox so the background dispatcher can publish them.
///
/// Separating commit from dispatch keeps the happy path fast and prevents
/// a slow subscriber from blocking the original request.
/// </summary>
internal sealed class MongoUnitOfWork(
    IDomainEventCollector collector,
    IOutboxStore outbox,
    IClock clock,
    ILogger<MongoUnitOfWork> logger) : IUnitOfWork
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var events = collector.DrainPending();
        if (events.Count == 0)
        {
            return 0;
        }

        var messages = new List<OutboxMessage>(events.Count);
        foreach (var ev in events)
        {
            var type = ev.GetType();
            var payload = JsonSerializer.Serialize(ev, type, SerializerOptions);
            messages.Add(new OutboxMessage(
                Id: ev.EventId == Guid.Empty ? Guid.NewGuid() : ev.EventId,
                TypeName: type.FullName ?? type.Name,
                AssemblyQualifiedName: type.AssemblyQualifiedName ?? type.FullName ?? type.Name,
                Payload: payload,
                OccurredOnUtc: ev.OccurredOnUtc == default ? clock.UtcNow : ev.OccurredOnUtc));
        }

        await outbox.EnqueueAsync(messages, cancellationToken);

        // Information-level breadcrumb so post-incident triage can
        // confirm the publish-side actually drained events into the
        // outbox. The dispatcher logs the *consume* side; together
        // they let us answer "did the publish even reach the outbox?"
        // without re-instrumenting on demand.
        if (logger.IsEnabled(LogLevel.Information))
        {
            logger.LogInformation(
                "Outbox enqueued {Count} domain event(s): {Types}",
                messages.Count,
                string.Join(", ", messages.Select(m => m.TypeName)));
        }

        return messages.Count;
    }
}
