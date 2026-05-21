namespace Wayel.Domain.Common;

/// <summary>
/// Marker for events raised by aggregates. Dispatched after the unit-of-work commits
/// so handlers can react to facts that have already happened.
/// Domain stays free of infrastructure: the Application layer adapts these to MediatR notifications.
/// </summary>
public interface IDomainEvent
{
    Guid EventId { get; }

    DateTime OccurredOnUtc { get; }
}
