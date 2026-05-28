using Wayel.Domain.Common;

namespace Wayel.Domain.Payments;

public readonly record struct CustomerSavedCardId(Guid Value) : IStronglyTypedId
{
    public static CustomerSavedCardId New() => new(StronglyTypedId.NewId());
}
