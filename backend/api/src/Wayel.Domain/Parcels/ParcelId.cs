using Wayel.Domain.Common;

namespace Wayel.Domain.Parcels;

public readonly record struct ParcelId(Guid Value) : IStronglyTypedId
{
    public static ParcelId New() => new(StronglyTypedId.NewId());
}
