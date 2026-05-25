namespace Wayel.Domain.Shipments;

public readonly record struct ShipmentTrackingEventId(Guid Value)
{
    public static ShipmentTrackingEventId New() => new(Guid.NewGuid());
}
