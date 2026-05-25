using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelDocument
{
    public ParcelId Id { get; set; }
    public UserId UserId { get; set; }
    public string SuiteNumber { get; set; } = "";
    public string Retailer { get; set; } = "";
    public string? TrackingNumber { get; set; }
    public string ItemName { get; set; } = "";
    public string Category { get; set; } = "";
    public decimal? DeclaredValueZar { get; set; }
    public string? DimensionsLabel { get; set; }
    public ParcelStatus Status { get; set; }
    public decimal? WeightKg { get; set; }
    public DateTime ReceivedAtUtc { get; set; }

    public static ParcelDocument From(Parcel p) => new()
    {
        Id = p.Id,
        UserId = p.UserId,
        SuiteNumber = p.SuiteNumber,
        Retailer = p.Retailer,
        TrackingNumber = p.TrackingNumber,
        ItemName = p.ItemName,
        Category = p.Category,
        DeclaredValueZar = p.DeclaredValueZar,
        DimensionsLabel = p.DimensionsLabel,
        Status = p.Status,
        WeightKg = p.WeightKg,
        ReceivedAtUtc = p.ReceivedAtUtc,
    };

    public Parcel ToDomain() =>
        Parcel.Rehydrate(
            Id,
            UserId,
            SuiteNumber,
            Retailer,
            TrackingNumber,
            ItemName,
            Category,
            DeclaredValueZar,
            DimensionsLabel,
            Status,
            WeightKg,
            ReceivedAtUtc);
}
