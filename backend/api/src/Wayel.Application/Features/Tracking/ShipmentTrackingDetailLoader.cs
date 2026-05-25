using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

internal sealed class ShipmentTrackingDetailLoader(
    IShipmentRepository shipments,
    IParcelRepository parcels,
    ICustomerAddressRepository addresses,
    IShipmentTrackingEventRepository trackingEvents,
    IClock clock)
{
    public async Task<Result<ShipmentTrackingDetailDto>> LoadAsync(
        User user,
        ShipmentId shipmentId,
        CancellationToken cancellationToken)
    {
        var shipment = await shipments.GetByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        if (shipment.UserId != user.Id)
        {
            return Error.Forbidden("shipment.forbidden", "You do not have access to this shipment.");
        }

        var shipmentParcels = await LoadParcels(shipment.ParcelIds, cancellationToken);
        var delivery = (await addresses.ListForUserAsync(user.Id, cancellationToken))
            .FirstOrDefault(a => a.IsDefault && !a.IsSuiteAddress)
            ?? (await addresses.ListForUserAsync(user.Id, cancellationToken))
                .FirstOrDefault(a => !a.IsSuiteAddress);

        var events = await trackingEvents.ListForShipmentAsync(shipment.Id, cancellationToken);

        return ShipmentTrackingDetailMapper.Map(
            shipment,
            shipmentParcels,
            delivery,
            user,
            clock.UtcNow,
            events);
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
}
