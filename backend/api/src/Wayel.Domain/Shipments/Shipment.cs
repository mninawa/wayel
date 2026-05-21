using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Domain.Shipments;

public sealed class Shipment : AggregateRoot<ShipmentId>
{
    private Shipment(ShipmentId id, UserId userId, IReadOnlyList<ParcelId> parcelIds, ShipmentStatus status, string deliveryMethod, string? shipOutLockedReason)
        : base(id)
    {
        UserId = userId;
        ParcelIds = parcelIds;
        Status = status;
        DeliveryMethod = deliveryMethod;
        ShipOutLockedReason = shipOutLockedReason;
    }

    public UserId UserId { get; }
    public IReadOnlyList<ParcelId> ParcelIds { get; }
    public ShipmentStatus Status { get; private set; }
    public string DeliveryMethod { get; }
    public string? ShipOutLockedReason { get; }

    public static Result<Shipment> Create(UserId userId, IReadOnlyList<ParcelId> parcelIds, string deliveryMethod, bool shipOutLocked, string? lockReason)
    {
        if (shipOutLocked)
        {
            return Result.Failure<Shipment>(Error.Forbidden("suite.ship_out_locked", lockReason ?? "Suite access expired."));
        }
        if (parcelIds.Count == 0)
        {
            return Result.Failure<Shipment>(Error.Validation("shipment.parcels_required", "Select at least one parcel."));
        }
        return new Shipment(ShipmentId.New(), userId, parcelIds, ShipmentStatus.Draft, deliveryMethod, null);
    }

    public static Shipment Rehydrate(ShipmentId id, UserId userId, IReadOnlyList<ParcelId> parcelIds, ShipmentStatus status, string deliveryMethod, string? shipOutLockedReason) =>
        new(id, userId, parcelIds, status, deliveryMethod, shipOutLockedReason);
}
