using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record GetParcelShipmentTrackingQuery(Guid ParcelId) : IQuery<ShipmentTrackingDetailDto>;

internal sealed class GetParcelShipmentTrackingQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IShipmentRepository shipments,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IClock clock,
    ShipmentTrackingDetailLoader loader) : IQueryHandler<GetParcelShipmentTrackingQuery, ShipmentTrackingDetailDto>
{
    public async Task<Result<ShipmentTrackingDetailDto>> Handle(
        GetParcelShipmentTrackingQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null || parcel.UserId != user.Id)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var shipmentId = await ResolveShipmentIdAsync(user.Id, parcel, cancellationToken);
        if (shipmentId is null)
        {
            return Error.NotFound(
                "shipment.not_linked",
                "No shipment is linked to this parcel yet.");
        }

        return await loader.LoadAsync(user, new ShipmentId(shipmentId.Value), cancellationToken);
    }

    private async Task<Guid?> ResolveShipmentIdAsync(
        UserId userId,
        Parcel parcel,
        CancellationToken cancellationToken)
    {
        var all = await shipments.ListForUserAsync(userId, cancellationToken);
        var match = all
            .Where(s => s.ParcelIds.Contains(parcel.Id))
            .OrderByDescending(ShipmentPriority)
            .FirstOrDefault();

        if (match is not null)
        {
            return match.Id.Value;
        }

        var resolver = new QuoteParcelStateResolver(quotes, quoteParcels, clock);
        return await resolver.ResolveShipmentIdAsync(parcel, cancellationToken);
    }

    private static int ShipmentPriority(Shipment shipment) =>
        shipment.Status switch
        {
            ShipmentStatus.InTransit => 100,
            ShipmentStatus.Paid => 80,
            ShipmentStatus.AwaitingApproval => 60,
            ShipmentStatus.Quoted => 40,
            ShipmentStatus.Delivered => 30,
            _ => 0,
        };
}
