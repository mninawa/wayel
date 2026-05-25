using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

/// <summary>
/// Ops view of a customer's recent parcel and shipment activity, used to feed
/// the "Address activity" panel on the account detail page. Returns a single
/// unified, newest-first timeline so the dashboard never has to stitch it
/// together from several queries.
/// </summary>
public sealed record GetCustomerAddressActivityQuery(Guid UserId, int Limit = 20)
    : IQuery<IReadOnlyList<CustomerAddressActivityItemDto>>;

public sealed record CustomerAddressActivityItemDto(
    string Id,
    string Icon,
    string Title,
    string? Subtitle,
    DateTime DateUtc,
    string Status,
    string StatusTone);

internal sealed class GetCustomerAddressActivityQueryHandler(
    IUserRepository users,
    IParcelRepository parcels,
    IShipmentRepository shipments,
    IShipmentTrackingEventRepository trackingEvents)
    : IQueryHandler<GetCustomerAddressActivityQuery, IReadOnlyList<CustomerAddressActivityItemDto>>
{
    public async Task<Result<IReadOnlyList<CustomerAddressActivityItemDto>>> Handle(
        GetCustomerAddressActivityQuery request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null || user.Role != UserRole.Customer)
        {
            return Error.NotFound("account.not_found", "Customer account not found.");
        }

        var limit = Math.Clamp(request.Limit, 1, 100);
        var parcelList = await parcels.ListForUserAsync(userId, cancellationToken);
        var shipmentList = await shipments.ListForUserAsync(userId, cancellationToken);

        var items = new List<CustomerAddressActivityItemDto>();
        foreach (var parcel in parcelList)
        {
            items.Add(BuildParcelReceived(parcel));
            if (parcel.Status is ParcelStatus.ReadyToShip or ParcelStatus.InShipment or ParcelStatus.Delivered)
            {
                items.Add(BuildParcelReadyToShip(parcel));
            }
        }

        foreach (var shipment in shipmentList)
        {
            var events = await trackingEvents.ListForShipmentAsync(shipment.Id, cancellationToken);
            if (events.Count == 0)
            {
                items.Add(BuildShipmentFallback(shipment));
                continue;
            }

            foreach (var ev in events)
            {
                items.Add(BuildShipmentEvent(shipment, ev));
            }
        }

        return items
            .OrderByDescending(i => i.DateUtc)
            .Take(limit)
            .ToList();
    }

    private static CustomerAddressActivityItemDto BuildParcelReceived(Parcel parcel)
    {
        var weightLabel = parcel.WeightKg is { } kg ? $"{kg:0.##} kg" : parcel.Category;
        var subtitle = string.IsNullOrWhiteSpace(parcel.Retailer)
            ? weightLabel
            : $"{parcel.Retailer} · {weightLabel}";

        return new CustomerAddressActivityItemDto(
            $"parcel-{parcel.Id.Value}-received",
            Icon: "inventory_2",
            Title: "Parcel received at suite",
            Subtitle: subtitle,
            DateUtc: parcel.ReceivedAtUtc,
            Status: "Received",
            StatusTone: "blue");
    }

    private static CustomerAddressActivityItemDto BuildParcelReadyToShip(Parcel parcel) =>
        new(
            $"parcel-{parcel.Id.Value}-ready",
            Icon: "package_2",
            Title: "Ready for shipment",
            Subtitle: parcel.TrackingNumber is null ? null : $"Tracking {parcel.TrackingNumber}",
            DateUtc: parcel.ReceivedAtUtc.AddHours(2),
            Status: "Processing",
            StatusTone: "amber");

    private static CustomerAddressActivityItemDto BuildShipmentEvent(Shipment shipment, ShipmentTrackingEvent ev)
    {
        var (icon, tone) = MapEventStyle(ev.EventType, ev.EventTone);
        return new CustomerAddressActivityItemDto(
            $"event-{ev.Id.Value}",
            Icon: icon,
            Title: ev.EventLabel,
            Subtitle: string.IsNullOrWhiteSpace(ev.Location) ? ev.Details : ev.Location,
            DateUtc: ev.OccurredAtUtc,
            Status: ev.EventLabel,
            StatusTone: tone);
    }

    private static CustomerAddressActivityItemDto BuildShipmentFallback(Shipment shipment) =>
        new(
            $"shipment-{shipment.Id.Value}-{shipment.Status}",
            Icon: ShipmentStatusIcon(shipment.Status),
            Title: $"Shipment {ShipmentStatusLabel(shipment.Status)}",
            Subtitle: shipment.DeliveryMethod,
            DateUtc: DateTime.UtcNow,
            Status: shipment.Status.ToString(),
            StatusTone: ShipmentStatusTone(shipment.Status));

    private static (string Icon, string Tone) MapEventStyle(string eventType, string eventTone)
    {
        var icon = eventType.ToLowerInvariant() switch
        {
            var t when t.Contains("delivered") => "check_circle",
            var t when t.Contains("transit") => "local_shipping",
            var t when t.Contains("paid") => "payments",
            var t when t.Contains("quote") => "request_quote",
            var t when t.Contains("approved") => "task_alt",
            var t when t.Contains("ship") => "local_shipping",
            _ => "timeline",
        };
        var tone = string.IsNullOrWhiteSpace(eventTone) ? "blue" : eventTone.ToLowerInvariant();
        return (icon, tone);
    }

    private static string ShipmentStatusIcon(ShipmentStatus status) => status switch
    {
        ShipmentStatus.Delivered => "check_circle",
        ShipmentStatus.InTransit => "local_shipping",
        ShipmentStatus.Paid => "payments",
        ShipmentStatus.AwaitingApproval => "schedule",
        ShipmentStatus.Quoted => "request_quote",
        _ => "timeline",
    };

    private static string ShipmentStatusLabel(ShipmentStatus status) => status switch
    {
        ShipmentStatus.Delivered => "delivered",
        ShipmentStatus.InTransit => "in transit",
        ShipmentStatus.Paid => "paid",
        ShipmentStatus.AwaitingApproval => "awaiting approval",
        ShipmentStatus.Quoted => "quoted",
        _ => "draft",
    };

    private static string ShipmentStatusTone(ShipmentStatus status) => status switch
    {
        ShipmentStatus.Delivered => "green",
        ShipmentStatus.InTransit => "blue",
        ShipmentStatus.Paid => "green",
        ShipmentStatus.AwaitingApproval => "amber",
        ShipmentStatus.Quoted => "amber",
        _ => "gray",
    };
}
