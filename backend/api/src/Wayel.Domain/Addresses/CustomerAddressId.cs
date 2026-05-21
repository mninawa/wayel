using Wayel.Domain.Common;

namespace Wayel.Domain.Addresses;

public readonly record struct CustomerAddressId(Guid Value) : IStronglyTypedId
{
    public static CustomerAddressId New() => new(StronglyTypedId.NewId());
}
