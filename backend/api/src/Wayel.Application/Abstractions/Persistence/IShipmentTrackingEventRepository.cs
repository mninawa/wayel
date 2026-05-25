using Wayel.Domain.Shipments;

namespace Wayel.Application.Abstractions.Persistence;

public interface IShipmentTrackingEventRepository
{
    Task<IReadOnlyList<ShipmentTrackingEvent>> ListForShipmentAsync(
        ShipmentId shipmentId,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(
        ShipmentId shipmentId,
        string eventType,
        CancellationToken cancellationToken = default);

    Task AddAsync(ShipmentTrackingEvent trackingEvent, CancellationToken cancellationToken = default);

    Task AddManyAsync(IEnumerable<ShipmentTrackingEvent> trackingEvents, CancellationToken cancellationToken = default);
}
