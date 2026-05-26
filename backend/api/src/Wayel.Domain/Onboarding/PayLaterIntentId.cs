using Wayel.Domain.Common;

namespace Wayel.Domain.Onboarding;

public readonly record struct PayLaterIntentId(Guid Value) : IStronglyTypedId
{
    public static PayLaterIntentId New() => new(StronglyTypedId.NewId());
}
