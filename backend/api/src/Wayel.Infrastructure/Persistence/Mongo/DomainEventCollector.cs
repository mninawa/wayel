using Wayel.Application.Abstractions.Messaging;
using Wayel.Domain.Common;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Simple in-memory collector scoped to the current request. Tolerates being
/// drained multiple times — draining returns + clears the buffer.
/// </summary>
internal sealed class DomainEventCollector : IDomainEventCollector
{
    private readonly List<IDomainEvent> _events = [];
    private readonly Lock _gate = new();

    public void Collect(IEnumerable<IDomainEvent> events)
    {
        ArgumentNullException.ThrowIfNull(events);
        lock (_gate)
        {
            _events.AddRange(events);
        }
    }

    public void CollectFrom<TId>(AggregateRoot<TId> root) where TId : notnull
    {
        ArgumentNullException.ThrowIfNull(root);
        if (root.DomainEvents.Count == 0) return;

        lock (_gate)
        {
            _events.AddRange(root.DomainEvents);
        }
        root.ClearDomainEvents();
    }

    public IReadOnlyList<IDomainEvent> DrainPending()
    {
        lock (_gate)
        {
            if (_events.Count == 0) return Array.Empty<IDomainEvent>();
            var snapshot = _events.ToArray();
            _events.Clear();
            return snapshot;
        }
    }
}
