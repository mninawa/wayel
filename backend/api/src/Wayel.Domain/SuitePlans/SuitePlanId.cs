using Wayel.Domain.Common;

namespace Wayel.Domain.SuitePlans;

public readonly record struct SuitePlanId(Guid Value) : IStronglyTypedId
{
    public static SuitePlanId New() => new(StronglyTypedId.NewId());
}
