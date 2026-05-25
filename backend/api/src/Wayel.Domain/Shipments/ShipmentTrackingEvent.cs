using Wayel.Domain.Parcels;

namespace Wayel.Domain.Shipments;

public sealed class ShipmentTrackingEvent
{
    private ShipmentTrackingEvent(
        ShipmentTrackingEventId id,
        ShipmentId shipmentId,
        string eventType,
        string eventLabel,
        string eventTone,
        string location,
        string details,
        DateTime occurredAtUtc,
        string source,
        ParcelId? parcelId)
    {
        Id = id;
        ShipmentId = shipmentId;
        EventType = eventType;
        EventLabel = eventLabel;
        EventTone = eventTone;
        Location = location;
        Details = details;
        OccurredAtUtc = occurredAtUtc;
        Source = source;
        ParcelId = parcelId;
    }

    public ShipmentTrackingEventId Id { get; }
    public ShipmentId ShipmentId { get; }
    public string EventType { get; }
    public string EventLabel { get; }
    public string EventTone { get; }
    public string Location { get; }
    public string Details { get; }
    public DateTime OccurredAtUtc { get; }
    public string Source { get; }
    public ParcelId? ParcelId { get; }

    public static ShipmentTrackingEvent Create(
        ShipmentId shipmentId,
        string eventType,
        string eventLabel,
        string eventTone,
        string location,
        string details,
        DateTime occurredAtUtc,
        string source = "system",
        ParcelId? parcelId = null) =>
        new(
            ShipmentTrackingEventId.New(),
            shipmentId,
            eventType.Trim(),
            eventLabel.Trim(),
            eventTone.Trim(),
            location.Trim(),
            details.Trim(),
            occurredAtUtc,
            source.Trim(),
            parcelId);

    public static ShipmentTrackingEvent Rehydrate(
        ShipmentTrackingEventId id,
        ShipmentId shipmentId,
        string eventType,
        string eventLabel,
        string eventTone,
        string location,
        string details,
        DateTime occurredAtUtc,
        string source,
        ParcelId? parcelId) =>
        new(id, shipmentId, eventType, eventLabel, eventTone, location, details, occurredAtUtc, source, parcelId);
}
