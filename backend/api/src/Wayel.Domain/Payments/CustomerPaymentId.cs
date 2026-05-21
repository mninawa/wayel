using Wayel.Domain.Common;

namespace Wayel.Domain.Payments;

public readonly record struct CustomerPaymentId(Guid Value) : IStronglyTypedId
{
    public static CustomerPaymentId New() => new(StronglyTypedId.NewId());
}
