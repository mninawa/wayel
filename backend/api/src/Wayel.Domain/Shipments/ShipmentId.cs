using Wayel.Domain.Common;

namespace Wayel.Domain.Shipments;

public readonly record struct ShipmentId(Guid Value) : IStronglyTypedId
{
    public static ShipmentId New() => new(StronglyTypedId.NewId());
}
