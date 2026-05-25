using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

public sealed class ShipmentTrackingEventWriter(
    IShipmentTrackingEventRepository events,
    IClock clock)
{
    private const string Origin = "Midrand, South Africa";

    public async Task RecordCheckoutCompletedAsync(
        Shipment shipment,
        IReadOnlyList<Parcel> parcels,
        string destinationLabel,
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var createdAt = parcels.Count > 0
            ? parcels.Min(p => p.ReceivedAtUtc)
            : now.AddMinutes(-30);

        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.Created,
            "Shipment Created",
            "success",
            Origin,
            "Shipment registered at WeYell hub",
            createdAt,
            cancellationToken);

        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.PaymentReceived,
            "Payment Received",
            "success",
            Origin,
            "Quote payment confirmed — preparing dispatch",
            now,
            cancellationToken);

        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.Dispatched,
            "Dispatched",
            "success",
            Origin,
            "Collected from WeYell facility",
            now.AddMinutes(5),
            cancellationToken);
    }

    public async Task<string> RecordOpsStatusTransitionAsync(
        Shipment shipment,
        ShipmentStatus status,
        string? location,
        string? details,
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var (eventType, label, tone, defaultLocation, defaultDetails) = status switch
        {
            ShipmentStatus.Paid => (
                ShipmentTrackingEventTypes.PaymentReceived,
                "Payment Received",
                "success",
                Origin,
                "Marked paid by warehouse ops"),
            ShipmentStatus.InTransit => (
                ShipmentTrackingEventTypes.InTransit,
                "In Transit",
                "info",
                "Johannesburg, South Africa",
                "Departed from transit facility"),
            ShipmentStatus.Delivered => (
                ShipmentTrackingEventTypes.Delivered,
                "Collected",
                "success",
                "Eswatini",
                "Collected at pickup branch"),
            _ => (
                ShipmentTrackingEventTypes.InTransit,
                status.ToString(),
                "info",
                Origin,
                "Status updated by warehouse ops"),
        };

        var resolvedLocation = string.IsNullOrWhiteSpace(location) ? defaultLocation : location.Trim();
        var resolvedDetails = string.IsNullOrWhiteSpace(details) ? defaultDetails : details.Trim();

        await RecordIfMissingAsync(
            shipment.Id,
            eventType,
            label,
            tone,
            resolvedLocation,
            resolvedDetails,
            now,
            cancellationToken);

        return label;
    }

    public async Task RecordReadyForDispatchAsync(
        Shipment shipment,
        string? notes,
        CancellationToken cancellationToken)
    {
        var details = string.IsNullOrWhiteSpace(notes)
            ? "Consolidated, repacked, and staged for courier pickup"
            : notes.Trim();

        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.ReadyForDispatch,
            "Ready for Dispatch",
            "success",
            Origin,
            details,
            clock.UtcNow,
            cancellationToken);
    }

    public async Task RecordReadyForCollectionAsync(
        Shipment shipment,
        string location,
        string details,
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.ArrivedInCountry,
            "Arrived in Country",
            "info",
            location,
            "Shipment arrived in Eswatini",
            now.AddMinutes(-5),
            cancellationToken);

        await RecordIfMissingAsync(
            shipment.Id,
            ShipmentTrackingEventTypes.ReadyForCollection,
            "Ready for Pickup",
            "success",
            location,
            details,
            now,
            cancellationToken);
    }

    public async Task BackfillFromStatusAsync(
        Shipment shipment,
        IReadOnlyList<Parcel> parcels,
        string destinationLabel,
        CancellationToken cancellationToken)
    {
        if (await events.ListForShipmentAsync(shipment.Id, cancellationToken) is { Count: > 0 })
        {
            return;
        }

        var baseDate = parcels.Count > 0
            ? parcels.Min(p => p.ReceivedAtUtc)
            : clock.UtcNow.AddDays(-3);

        var timeline = BuildBackfillTimeline(shipment.Status, baseDate, destinationLabel);
        var batch = timeline
            .Select(t => ShipmentTrackingEvent.Create(
                shipment.Id,
                t.EventType,
                t.EventLabel,
                t.EventTone,
                t.Location,
                t.Details,
                t.OccurredAtUtc,
                "backfill"))
            .ToList();

        await events.AddManyAsync(batch, cancellationToken);
    }

    private async Task RecordIfMissingAsync(
        ShipmentId shipmentId,
        string eventType,
        string eventLabel,
        string eventTone,
        string location,
        string details,
        DateTime occurredAtUtc,
        CancellationToken cancellationToken)
    {
        if (await events.ExistsAsync(shipmentId, eventType, cancellationToken))
        {
            return;
        }

        await events.AddAsync(
            ShipmentTrackingEvent.Create(
                shipmentId,
                eventType,
                eventLabel,
                eventTone,
                location,
                details,
                occurredAtUtc),
            cancellationToken);
    }

    private static List<(string EventType, string EventLabel, string EventTone, string Location, string Details, DateTime OccurredAtUtc)> BuildBackfillTimeline(
        ShipmentStatus status,
        DateTime baseDate,
        string destinationLabel)
    {
        var list = new List<(string, string, string, string, string, DateTime)>
        {
            (
                ShipmentTrackingEventTypes.Created,
                "Shipment Created",
                "success",
                Origin,
                "Shipment registered at WeYell hub",
                baseDate),
        };

        if (status is ShipmentStatus.Paid or ShipmentStatus.InTransit or ShipmentStatus.Delivered)
        {
            list.Add((
                ShipmentTrackingEventTypes.PaymentReceived,
                "Payment Received",
                "success",
                Origin,
                "Quote payment confirmed",
                baseDate.AddHours(8)));
            list.Add((
                ShipmentTrackingEventTypes.Dispatched,
                "Dispatched",
                "success",
                Origin,
                "Collected from WeYell facility",
                baseDate.AddHours(8.5)));
        }

        if (status is ShipmentStatus.InTransit or ShipmentStatus.Delivered)
        {
            list.Add((
                ShipmentTrackingEventTypes.InTransit,
                "In Transit",
                "info",
                "Johannesburg, South Africa",
                "Departed from transit facility",
                baseDate.AddDays(2).AddHours(8.5)));
        }

        if (status == ShipmentStatus.Delivered)
        {
            list.Add((
                ShipmentTrackingEventTypes.ArrivedInCountry,
                "Arrived in Country",
                "info",
                destinationLabel,
                "Shipment arrived in destination country",
                baseDate.AddDays(4)));
            list.Add((
                ShipmentTrackingEventTypes.ReadyForCollection,
                "Ready for Pickup",
                "success",
                destinationLabel,
                "Available for pickup at branch",
                baseDate.AddDays(4).AddHours(5)));
            list.Add((
                ShipmentTrackingEventTypes.Delivered,
                "Collected",
                "success",
                destinationLabel,
                "Collected at pickup branch",
                baseDate.AddDays(5).AddHours(18)));
        }

        return list;
    }
}
