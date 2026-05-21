using Wayel.Domain.Common;

namespace Wayel.Domain.SuiteSubscriptions;

public readonly record struct SuiteSubscriptionId(Guid Value) : IStronglyTypedId
{
    public static SuiteSubscriptionId New() => new(StronglyTypedId.NewId());
}
