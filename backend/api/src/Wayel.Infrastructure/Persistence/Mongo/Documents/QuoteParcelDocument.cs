using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class QuoteParcelDocument
{
    public QuoteParcelId Id { get; set; }
    public QuoteId QuoteId { get; set; }
    public ParcelId ParcelId { get; set; }
    public decimal DeclaredValueZar { get; set; }
    public decimal? WeightKg { get; set; }
    public string? DimensionsLabel { get; set; }

    public static QuoteParcelDocument From(QuoteParcel link) =>
        new()
        {
            Id = link.Id,
            QuoteId = link.QuoteId,
            ParcelId = link.ParcelId,
            DeclaredValueZar = link.DeclaredValueZar,
            WeightKg = link.WeightKg,
            DimensionsLabel = link.DimensionsLabel,
        };

    public QuoteParcel ToDomain() =>
        QuoteParcel.Rehydrate(
            Id,
            QuoteId,
            ParcelId,
            DeclaredValueZar,
            WeightKg,
            DimensionsLabel);
}
