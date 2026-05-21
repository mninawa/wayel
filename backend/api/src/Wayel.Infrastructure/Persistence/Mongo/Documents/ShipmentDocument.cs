using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ShipmentDocument
{
    public ShipmentId Id { get; set; }
    public UserId UserId { get; set; }
    public List<ParcelId> ParcelIds { get; set; } = [];
    public ShipmentStatus Status { get; set; }
    public string DeliveryMethod { get; set; } = "";
    public string? ShipOutLockedReason { get; set; }

    public static ShipmentDocument From(Shipment s) => new() { Id=s.Id, UserId=s.UserId, ParcelIds=s.ParcelIds.ToList(), Status=s.Status, DeliveryMethod=s.DeliveryMethod, ShipOutLockedReason=s.ShipOutLockedReason };
    public Shipment ToDomain() => Shipment.Rehydrate(Id, UserId, ParcelIds, Status, DeliveryMethod, ShipOutLockedReason);
}
