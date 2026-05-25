using Wayel.Domain.Parcels;

namespace Wayel.Domain.Quotes;

public sealed class QuoteParcel
{
    public QuoteParcel(
        QuoteParcelId id,
        QuoteId quoteId,
        ParcelId parcelId,
        decimal declaredValueZar,
        decimal? weightKg,
        string? dimensionsLabel)
    {
        Id = id;
        QuoteId = quoteId;
        ParcelId = parcelId;
        DeclaredValueZar = declaredValueZar;
        WeightKg = weightKg;
        DimensionsLabel = dimensionsLabel;
    }

    public QuoteParcelId Id { get; }
    public QuoteId QuoteId { get; }
    public ParcelId ParcelId { get; }
    public decimal DeclaredValueZar { get; }
    public decimal? WeightKg { get; }
    public string? DimensionsLabel { get; }

    public static QuoteParcel Create(
        QuoteId quoteId,
        ParcelId parcelId,
        decimal declaredValueZar,
        decimal? weightKg,
        string? dimensionsLabel) =>
        new(
            QuoteParcelId.New(),
            quoteId,
            parcelId,
            declaredValueZar,
            weightKg,
            dimensionsLabel);

    public static QuoteParcel Rehydrate(
        QuoteParcelId id,
        QuoteId quoteId,
        ParcelId parcelId,
        decimal declaredValueZar,
        decimal? weightKg,
        string? dimensionsLabel) =>
        new(id, quoteId, parcelId, declaredValueZar, weightKg, dimensionsLabel);
}
