using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

public sealed record ListOpsShipmentsQuery(int Limit = 50) : IQuery<IReadOnlyList<OpsShipmentListItemDto>>;

internal sealed class ListOpsShipmentsQueryHandler(
    IShipmentRepository shipments,
    IUserRepository users,
    IParcelRepository parcels,
    IShipmentTrackingEventRepository trackingEvents) : IQueryHandler<ListOpsShipmentsQuery, IReadOnlyList<OpsShipmentListItemDto>>
{
    public async Task<Result<IReadOnlyList<OpsShipmentListItemDto>>> Handle(
        ListOpsShipmentsQuery request,
        CancellationToken cancellationToken)
    {
        var items = await shipments.ListActiveForOpsAsync(request.Limit, cancellationToken);
        var result = new List<OpsShipmentListItemDto>();

        foreach (var shipment in items)
        {
            var user = await users.GetByIdAsync(shipment.UserId, cancellationToken);
            var shipmentParcels = await LoadParcels(shipment.ParcelIds, cancellationToken);
            var events = await trackingEvents.ListForShipmentAsync(shipment.Id, cancellationToken);
            var tracking = shipmentParcels
                .Select(p => p.TrackingNumber)
                .FirstOrDefault(t => !string.IsNullOrWhiteSpace(t));

            result.Add(new OpsShipmentListItemDto(
                shipment.Id.Value,
                shipment.Status.ToString(),
                ToStatusLabel(shipment.Status),
                user?.DisplayName ?? "Customer",
                user?.Email.Value ?? "—",
                tracking,
                shipmentParcels.Count,
                shipment.DeliveryMethod,
                events.Count > 0 ? events[^1].OccurredAtUtc : null));
        }

        return result;
    }

    private async Task<IReadOnlyList<Parcel>> LoadParcels(
        IReadOnlyList<ParcelId> ids,
        CancellationToken cancellationToken)
    {
        var list = new List<Parcel>();
        foreach (var id in ids)
        {
            var p = await parcels.GetByIdAsync(id, cancellationToken);
            if (p is not null)
            {
                list.Add(p);
            }
        }

        return list;
    }

    private static string ToStatusLabel(ShipmentStatus status) =>
        status switch
        {
            ShipmentStatus.InTransit => "In Transit",
            ShipmentStatus.Delivered => "Delivered",
            ShipmentStatus.Paid => "Paid — preparing dispatch",
            ShipmentStatus.AwaitingApproval => "Awaiting approval",
            ShipmentStatus.Quoted => "Quoted",
            ShipmentStatus.Draft => "Draft",
            _ => status.ToString(),
        };
}
