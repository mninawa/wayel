namespace Wayel.Domain.Quotes;

public readonly record struct QuoteParcelId(Guid Value)
{
    public static QuoteParcelId New() => new(Guid.NewGuid());
    public static QuoteParcelId From(Guid value) => new(value);
    public override string ToString() => Value.ToString();
}
