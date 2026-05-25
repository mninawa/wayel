using System.Globalization;
using Wayel.Domain.Addresses;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

internal static class ShipmentTrackingDetailMapper
{
    private static readonly CourierInfoDto DefaultCourier = new(
        "PUDO",
        "www.pudo.co.za",
        "087 820 2656");

    internal static ShipmentTrackingDetailDto Map(
        Shipment shipment,
        IReadOnlyList<Parcel> parcels,
        CustomerAddress? deliveryAddress,
        User user,
        DateTime nowUtc,
        IReadOnlyList<ShipmentTrackingEvent> trackingEvents)
    {
        var origin = "Midrand, South Africa";
        var destination = FormatDestination(deliveryAddress);
        var trackingNumber = BuildTrackingNumber(shipment, parcels);
        var totalWeight = parcels.Sum(p => p.WeightKg ?? 0m);
        var declared = parcels.Sum(p => p.DeclaredValueZar ?? 0m);
        var statusLabel = ToStatusLabel(shipment.Status);
        var milestones = trackingEvents.Count > 0
            ? ShipmentTrackingEventProjector.ProjectMilestones(trackingEvents, shipment.Status)
            : BuildMilestones(shipment.Status, shipment.Id.Value, parcels, nowUtc);
        var history = trackingEvents.Count > 0
            ? ShipmentTrackingEventProjector.ProjectHistory(trackingEvents)
            : BuildHistory(shipment.Status, milestones, parcels, origin, destination);
        var parcelRows = BuildParcelRows(shipment, parcels, trackingNumber);

        return new ShipmentTrackingDetailDto(
            shipment.Id.Value,
            trackingNumber,
            shipment.Status.ToString(),
            statusLabel,
            FormatDeliveryMethod(shipment.DeliveryMethod),
            EstimateDeliveryLabel(shipment.Status, nowUtc),
            origin,
            destination,
            parcels.Count,
            $"{totalWeight:0.00} kg",
            $"ZAR {declared.ToString("N2", CultureInfo.InvariantCulture)}",
            milestones,
            parcelRows,
            DefaultCourier,
            MapRecipient(deliveryAddress, user),
            history,
            "All times shown in SAST (UTC+2)");
    }

    private static string BuildTrackingNumber(Shipment shipment, IReadOnlyList<Parcel> parcels)
    {
        var first = parcels.FirstOrDefault(p => !string.IsNullOrWhiteSpace(p.TrackingNumber));
        if (first?.TrackingNumber is { } tn)
        {
            return tn;
        }

        var suffix = shipment.Id.Value.ToString("N")[..10].ToUpperInvariant();
        return $"BRC{suffix}ZA";
    }

    private static string FormatDestination(CustomerAddress? address)
    {
        if (address is null)
        {
            return "Eswatini";
        }

        var city = string.IsNullOrWhiteSpace(address.City) ? "Eswatini" : address.City;
        return $"{city}, Eswatini";
    }

    private static string FormatDeliveryMethod(string method)
    {
        if (string.IsNullOrWhiteSpace(method))
        {
            return "Branch pickup";
        }

        return method.Contains("door", StringComparison.OrdinalIgnoreCase) ||
               method.Contains("Door", StringComparison.Ordinal)
            ? "Branch pickup"
            : method;
    }

    private static string ToStatusLabel(ShipmentStatus status) =>
        status switch
        {
            ShipmentStatus.InTransit => "In Transit",
            ShipmentStatus.Delivered => "Collected",
            ShipmentStatus.Paid => "Paid — preparing dispatch",
            ShipmentStatus.AwaitingApproval => "Awaiting approval",
            ShipmentStatus.Quoted => "Quoted",
            ShipmentStatus.Draft => "Draft",
            _ => status.ToString(),
        };

    private static string EstimateDeliveryLabel(ShipmentStatus status, DateTime nowUtc)
    {
        if (status == ShipmentStatus.Delivered)
        {
            return "Collected";
        }

        if (status is ShipmentStatus.InTransit or ShipmentStatus.Paid or ShipmentStatus.AwaitingApproval)
        {
            var eta = nowUtc.AddDays(6).ToLocalTime();
            return $"{eta:dd MMM yyyy} — ready for pickup";
        }

        return "Pending dispatch";
    }

    private static RecipientInfoDto MapRecipient(CustomerAddress? address, User user)
    {
        if (address is null)
        {
            return new RecipientInfoDto(
                user.DisplayName,
                user.Phone ?? "—",
                "Eswatini");
        }

        var name = string.IsNullOrWhiteSpace(address.RecipientName)
            ? user.DisplayName
            : address.RecipientName;
        var phone = string.IsNullOrWhiteSpace(address.Phone) ? user.Phone ?? "—" : address.Phone;
        var parts = new[] { address.Line1, address.Line2, address.City, address.Province, address.Country }
            .Where(s => !string.IsNullOrWhiteSpace(s));
        return new RecipientInfoDto(name, phone, string.Join(", ", parts));
    }

    private static List<ShipmentTrackingParcelRowDto> BuildParcelRows(
        Shipment shipment,
        IReadOnlyList<Parcel> parcels,
        string masterTracking)
    {
        var rows = new List<ShipmentTrackingParcelRowDto>();
        for (var i = 0; i < parcels.Count; i++)
        {
            var p = parcels[i];
            var piece = parcels.Count > 1 ? $"-{i + 1}" : string.Empty;
            var tn = !string.IsNullOrWhiteSpace(p.TrackingNumber)
                ? p.TrackingNumber
                : $"{masterTracking}{piece}";
            rows.Add(new ShipmentTrackingParcelRowDto(
                tn,
                p.ItemName,
                p.WeightKg,
                shipment.Status.ToString(),
                ToStatusLabel(shipment.Status)));
        }

        return rows;
    }

    private static List<ShipmentTrackingMilestoneDto> BuildMilestones(
        ShipmentStatus status,
        Guid shipmentId,
        IReadOnlyList<Parcel> parcels,
        DateTime nowUtc)
    {
        var seed = shipmentId.GetHashCode();
        var baseDate = parcels.Count > 0
            ? parcels.Min(p => p.ReceivedAtUtc)
            : nowUtc.AddDays(-3).Date.AddHours(9);

        var steps = new (string Label, string Icon)[]
        {
            ("Shipment Created", "inventory_2"),
            ("Payment Received", "payments"),
            ("Ready for Dispatch", "inventory"),
            ("In Transit", "local_shipping"),
            ("Dispatched", "local_shipping"),
            ("Arrived in Country", "flight_land"),
            ("Ready for Pickup", "store"),
            ("Collected", "check_circle"),
        };

        var currentIndex = status switch
        {
            ShipmentStatus.Draft or ShipmentStatus.Quoted => 0,
            ShipmentStatus.AwaitingApproval => 1,
            ShipmentStatus.Paid => 3,
            ShipmentStatus.InTransit => 4,
            ShipmentStatus.Delivered => 7,
            _ => 0,
        };

        if (status == ShipmentStatus.Delivered)
        {
            currentIndex = 7;
        }

        return steps
            .Select((s, i) =>
            {
                var done = i < currentIndex || status == ShipmentStatus.Delivered;
                var current = i == currentIndex && status != ShipmentStatus.Delivered;
                DateTime? at = null;
                if (done || current)
                {
                    at = baseDate.AddDays(i * 0.5 + (seed % 5) * 0.1);
                    if (i == 0) at = baseDate;
                    if (i == 1) at = baseDate.AddHours(7.5);
                    if (i == 2 && status == ShipmentStatus.InTransit) at = nowUtc.AddDays(-1).Date.AddHours(8.5);
                }

                return new ShipmentTrackingMilestoneDto(s.Label, s.Icon, done, current, at);
            })
            .ToList();
    }

    private static List<ShipmentTrackingHistoryEventDto> BuildHistory(
        ShipmentStatus status,
        IReadOnlyList<ShipmentTrackingMilestoneDto> milestones,
        IReadOnlyList<Parcel> parcels,
        string origin,
        string destination)
    {
        var events = new List<ShipmentTrackingHistoryEventDto>();
        foreach (var m in milestones.Where(x => x.OccurredAtUtc.HasValue).Reverse())
        {
            var (location, details, tone) = m.Label switch
            {
                "Shipment Created" => (origin, "Shipment registered at WeYell hub", "success"),
                "Dispatched" => ("Midrand, South Africa", "Collected from WeYell facility", "success"),
                "In Transit" => ("Johannesburg, South Africa", "Departed from transit facility", "info"),
                "Arrived in Country" => (destination, "Shipment arrived in destination country", "info"),
                "Ready for Pickup" => (destination, "Available for pickup at branch", "success"),
                "Collected" => (destination, "Collected at pickup branch", "success"),
                _ => (origin, m.Label, "muted"),
            };

            events.Add(new ShipmentTrackingHistoryEventDto(
                m.OccurredAtUtc!.Value,
                m.Label,
                tone,
                location,
                details));
        }

        if (events.Count == 0 && parcels.Count > 0)
        {
            events.Add(new ShipmentTrackingHistoryEventDto(
                DateTime.UtcNow,
                ToStatusLabel(status),
                "info",
                origin,
                "Tracking updates will appear here."));
        }

        return events.OrderByDescending(e => e.OccurredAtUtc).ToList();
    }
}
