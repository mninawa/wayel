using Wayel.Domain.Common;

namespace Wayel.Domain.Users;

public readonly record struct UserId(Guid Value) : IStronglyTypedId
{
    public static UserId New() => new(StronglyTypedId.NewId());

    public override string ToString() => Value.ToString("D");
}
