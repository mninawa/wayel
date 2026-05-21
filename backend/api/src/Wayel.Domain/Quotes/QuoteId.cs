using Wayel.Domain.Common;

namespace Wayel.Domain.Quotes;

public readonly record struct QuoteId(Guid Value) : IStronglyTypedId
{
    public static QuoteId New() => new(StronglyTypedId.NewId());
}
