using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

internal static class ShipmentTrackingEventProjector
{
    /// <summary>Cross-border PUDO journey — customers collect at a branch in Eswatini or Namibia.</summary>
    private static readonly (string EventType, string Label, string Icon)[] MilestoneTemplate =
    [
        (ShipmentTrackingEventTypes.Created, "Shipment Created", "inventory_2"),
        (ShipmentTrackingEventTypes.PaymentReceived, "Payment Received", "payments"),
        (ShipmentTrackingEventTypes.ReadyForDispatch, "Ready for Dispatch", "inventory"),
        (ShipmentTrackingEventTypes.InTransit, "In Transit", "local_shipping"),
        (ShipmentTrackingEventTypes.Dispatched, "Dispatched", "local_shipping"),
        (ShipmentTrackingEventTypes.ArrivedInCountry, "Arrived in Country", "flight_land"),
        (ShipmentTrackingEventTypes.ReadyForCollection, "Ready for Pickup", "store"),
        (ShipmentTrackingEventTypes.Delivered, "Collected", "check_circle"),
    ];

    internal static List<ShipmentTrackingMilestoneDto> ProjectMilestones(
        IReadOnlyList<ShipmentTrackingEvent> events,
        ShipmentStatus status)
    {
        var byType = events
            .GroupBy(e => e.EventType, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.OccurredAtUtc).First(), StringComparer.Ordinal);

        var maxRecordedOrder = events.Count == 0
            ? 0
            : events.Max(e => ShipmentTrackingEventTypes.JourneyOrder(e.EventType));

        var milestones = new List<ShipmentTrackingMilestoneDto>();
        var currentIndex = ResolveCurrentMilestoneIndex(maxRecordedOrder, status);

        for (var i = 0; i < MilestoneTemplate.Length; i++)
        {
            var (eventType, label, icon) = MilestoneTemplate[i];
            byType.TryGetValue(eventType, out var recorded);
            var stepOrder = ShipmentTrackingEventTypes.JourneyOrder(eventType);
            var done = recorded is not null
                || stepOrder <= maxRecordedOrder
                || status == ShipmentStatus.Delivered;

            milestones.Add(new ShipmentTrackingMilestoneDto(
                label,
                icon,
                done,
                false,
                recorded?.OccurredAtUtc));
        }

        if (status == ShipmentStatus.Delivered)
        {
            return milestones
                .Select(m => m with { Done = true, Current = false })
                .ToList();
        }

        if (currentIndex >= 0)
        {
            var current = milestones[currentIndex] with { Current = true };
            milestones[currentIndex] = current;
        }

        return milestones;
    }

    internal static List<ShipmentTrackingHistoryEventDto> ProjectHistory(
        IReadOnlyList<ShipmentTrackingEvent> events)
    {
        return events
            .OrderByDescending(e => ShipmentTrackingEventTypes.JourneyOrder(e.EventType))
            .ThenByDescending(e => e.OccurredAtUtc)
            .Select(e => new ShipmentTrackingHistoryEventDto(
                e.OccurredAtUtc,
                CustomerFacingLabel(e),
                e.EventTone,
                e.Location,
                e.Details))
            .ToList();
    }

    internal static List<TrackingTimelineStepDto> ProjectOverviewTimeline(
        IReadOnlyList<ShipmentTrackingEvent> events,
        ShipmentStatus status)
    {
        var byType = events
            .GroupBy(e => e.EventType, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.OccurredAtUtc).First(), StringComparer.Ordinal);

        var steps = new (string Label, string EventType)[]
        {
            ("Received in South Africa", ShipmentTrackingEventTypes.Created),
            ("In Transit to destination", ShipmentTrackingEventTypes.InTransit),
            ("Arrived in country", ShipmentTrackingEventTypes.ArrivedInCountry),
            ("Ready for pickup", ShipmentTrackingEventTypes.ReadyForCollection),
        };

        var firstPending = -1;
        var timeline = new List<TrackingTimelineStepDto>();

        for (var i = 0; i < steps.Length; i++)
        {
            var (label, eventType) = steps[i];
            byType.TryGetValue(eventType, out var recorded);
            var done = recorded is not null;
            if (!done && firstPending < 0)
            {
                firstPending = i;
            }

            timeline.Add(new TrackingTimelineStepDto(
                label,
                done,
                false,
                recorded?.OccurredAtUtc));
        }

        if (status == ShipmentStatus.Delivered)
        {
            return timeline.Select(t => t with { Done = true, Current = false }).ToList();
        }

        if (firstPending >= 0)
        {
            var current = timeline[firstPending] with { Current = true };
            timeline[firstPending] = current;
        }

        return timeline;
    }

    private static int ResolveCurrentMilestoneIndex(int maxRecordedOrder, ShipmentStatus status)
    {
        if (status == ShipmentStatus.Delivered)
        {
            return -1;
        }

        for (var i = 0; i < MilestoneTemplate.Length; i++)
        {
            var order = ShipmentTrackingEventTypes.JourneyOrder(MilestoneTemplate[i].EventType);
            if (order > maxRecordedOrder)
            {
                return i;
            }
        }

        return -1;
    }

    private static string CustomerFacingLabel(ShipmentTrackingEvent trackingEvent) =>
        trackingEvent.EventType switch
        {
            ShipmentTrackingEventTypes.ReadyForCollection => "Ready for Pickup",
            ShipmentTrackingEventTypes.Delivered => "Collected",
            ShipmentTrackingEventTypes.OutForDelivery => "Ready for Pickup",
            _ => trackingEvent.EventLabel,
        };
}
