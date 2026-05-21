using Wayel.Domain.Common;

namespace Wayel.Domain.Sessions;

public readonly record struct RefreshTokenId(Guid Value) : IStronglyTypedId
{
    public static RefreshTokenId New() => new(StronglyTypedId.NewId());

    public override string ToString() => Value.ToString("D");
}
