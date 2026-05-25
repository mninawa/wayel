using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ShipmentTrackingEventDocument
{
    public Guid Id { get; init; }
    public Guid ShipmentId { get; init; }
    public string EventType { get; init; } = string.Empty;
    public string EventLabel { get; init; } = string.Empty;
    public string EventTone { get; init; } = string.Empty;
    public string Location { get; init; } = string.Empty;
    public string Details { get; init; } = string.Empty;
    public DateTime OccurredAtUtc { get; init; }
    public string Source { get; init; } = "system";
    public Guid? ParcelId { get; init; }

    public static ShipmentTrackingEventDocument From(ShipmentTrackingEvent e) =>
        new()
        {
            Id = e.Id.Value,
            ShipmentId = e.ShipmentId.Value,
            EventType = e.EventType,
            EventLabel = e.EventLabel,
            EventTone = e.EventTone,
            Location = e.Location,
            Details = e.Details,
            OccurredAtUtc = e.OccurredAtUtc,
            Source = e.Source,
            ParcelId = e.ParcelId?.Value,
        };

    public ShipmentTrackingEvent ToDomain() =>
        ShipmentTrackingEvent.Rehydrate(
            new ShipmentTrackingEventId(Id),
            new ShipmentId(ShipmentId),
            EventType,
            EventLabel,
            EventTone,
            Location,
            Details,
            OccurredAtUtc,
            Source,
            ParcelId is { } pid ? new ParcelId(pid) : null);
}
