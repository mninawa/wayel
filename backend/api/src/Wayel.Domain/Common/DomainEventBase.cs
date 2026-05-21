namespace Wayel.Domain.Common;

/// <summary>
/// Convenience base for domain events that don't need to override how the
/// id or timestamp are generated. Aggregates can still implement
/// <see cref="IDomainEvent"/> directly when they want full control.
/// </summary>
public abstract record DomainEventBase : IDomainEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();

    public DateTime OccurredOnUtc { get; init; } = DateTime.UtcNow;
}
