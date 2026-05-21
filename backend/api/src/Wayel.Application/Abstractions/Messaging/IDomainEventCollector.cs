using Wayel.Domain.Common;

namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// Scoped collector that accumulates domain events raised by aggregates
/// during a single request. Repositories push events here after persisting an
/// aggregate and <see cref="Wayel.Application.Abstractions.Persistence.IUnitOfWork"/>
/// drains them into the outbox at commit time.
///
/// Keeping this separate from the aggregates themselves lets repositories
/// stay thin (no knowledge of the outbox) while giving the UoW a single
/// place to harvest events before dispatch.
/// </summary>
public interface IDomainEventCollector
{
    void Collect(IEnumerable<IDomainEvent> events);

    void CollectFrom<TId>(AggregateRoot<TId> root) where TId : notnull;

    IReadOnlyList<IDomainEvent> DrainPending();
}
