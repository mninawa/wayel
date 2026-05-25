using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

internal static class ShipmentTrackingMapper
{
    internal static ShipmentTrackingDto Map(
        Shipment shipment,
        IReadOnlyList<Parcel> parcels,
        string toLabel,
        IReadOnlyList<ShipmentTrackingEvent> trackingEvents)
    {
        var first = parcels.Count > 0 ? parcels[0] : null;
        var primary = first?.TrackingNumber ?? first?.Id.Value.ToString()[..8];
        var weight = parcels.Sum(p => p.WeightKg ?? 0m);
        var reference = $"SHP-{shipment.Id.Value.ToString("N")[..8].ToUpperInvariant()}";

        return new ShipmentTrackingDto(
            shipment.Id.Value,
            reference,
            shipment.Status.ToString(),
            ToStatusLabel(shipment.Status),
            primary,
            "Midrand, Gauteng, South Africa",
            toLabel,
            shipment.DeliveryMethod,
            $"{weight:0.00} kg",
            parcels.Count,
            EstimateDelivery(shipment.Status),
            trackingEvents.Count > 0
                ? ShipmentTrackingEventProjector.ProjectOverviewTimeline(trackingEvents, shipment.Status)
                : BuildTimeline(shipment.Status, shipment.Id.Value));
    }

    private static string ToStatusLabel(ShipmentStatus status) =>
        status switch
        {
            ShipmentStatus.Draft => "Draft",
            ShipmentStatus.Quoted => "Quoted",
            ShipmentStatus.AwaitingApproval => "Awaiting approval",
            ShipmentStatus.Paid => "Paid — preparing dispatch",
            ShipmentStatus.InTransit => "In transit",
            ShipmentStatus.Delivered => "Collected",
            _ => status.ToString(),
        };

    private static string? EstimateDelivery(ShipmentStatus status) =>
        status switch
        {
            ShipmentStatus.InTransit => "4–6 working days",
            ShipmentStatus.Delivered => "Collected",
            _ => "Pending dispatch",
        };

    private static List<TrackingTimelineStepDto> BuildTimeline(ShipmentStatus status, Guid shipmentId)
    {
        var seed = shipmentId.GetHashCode();
        var baseDate = DateTime.UtcNow.AddDays(-2);

        var steps = new (string Label, int Threshold)[]
        {
            ("Received in South Africa", 0),
            ("In Transit to destination", 1),
            ("Arrived in country", 2),
            ("Ready for pickup", 3),
        };

        var currentIndex = status switch
        {
            ShipmentStatus.Draft or ShipmentStatus.Quoted or ShipmentStatus.AwaitingApproval => 0,
            ShipmentStatus.Paid => 1,
            ShipmentStatus.InTransit => 1,
            ShipmentStatus.Delivered => 3,
            _ => 0,
        };

        return steps
            .Select((s, i) =>
            {
                var done = i < currentIndex || status == ShipmentStatus.Delivered;
                var current = i == currentIndex && status != ShipmentStatus.Delivered;
                var at = baseDate.AddHours(i * 6 + (seed % 3));
                return new TrackingTimelineStepDto(s.Label, done, current, done || current ? at : null);
            })
            .ToList();
    }
}
