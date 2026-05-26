using Wayel.Domain.Common;

namespace Wayel.Domain.SuiteSubscriptions;

public readonly record struct SuiteNumberPoolEntryId(Guid Value) : IStronglyTypedId
{
    public static SuiteNumberPoolEntryId New() => new(StronglyTypedId.NewId());
}
