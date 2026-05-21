using Wayel.Domain.Common;

namespace Wayel.Domain.Identities;

public readonly record struct ExternalIdentityId(Guid Value) : IStronglyTypedId
{
    public static ExternalIdentityId New() => new(StronglyTypedId.NewId());

    public override string ToString() => Value.ToString("D");
}
