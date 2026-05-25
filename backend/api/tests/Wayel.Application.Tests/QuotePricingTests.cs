using Wayel.Application.Features.Quotes;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class QuotePricingTests
{
    [Fact]
    public void Standard_take_is_25_percent_of_goods_value_when_vat_enabled()
    {
        var userId = UserId.New();
        var parcels = new[]
        {
            Parcel.Rehydrate(
                ParcelId.New(), userId, "24789", "Takealot", "T1", "Item A", "Electronics",
                1500m, "10x10x10", ParcelStatus.ReadyToShip, 2m, DateTime.UtcNow),
            Parcel.Rehydrate(
                ParcelId.New(), userId, "24789", "Makro", "T2", "Item B", "Homeware",
                1500m, "10x10x10", ParcelStatus.ReadyToShip, 2.2m, DateTime.UtcNow),
        };

        var result = QuotePricing.Compute(parcels, "PUDO", BorderBoxPricingSettings.Defaults);

        Assert.Equal(3000m, result.DeclaredGoodsValueZar);
        Assert.True(result.VatCharged);
        var vatLine = result.Breakdown.Single(l => l.Label.StartsWith("VAT (", StringComparison.Ordinal));
        var handlingLine = result.Breakdown.Single(l => l.Label.StartsWith("Handling fee (", StringComparison.Ordinal));
        var freightLine = result.Breakdown.Single(l => l.Label.StartsWith("Freight fee (", StringComparison.Ordinal));
        Assert.Equal(450m, vatLine.Amount);
        Assert.Equal(100m, handlingLine.Amount);
        Assert.Equal(200m, freightLine.Amount);
        Assert.EndsWith("15%)", vatLine.Label, StringComparison.Ordinal);
        Assert.Equal("Handling fee (3.3%)", handlingLine.Label);
        Assert.Equal("Freight fee (6.7%)", freightLine.Label);
        Assert.Equal(750m, result.TotalLandedCost);
    }

    [Fact]
    public void Service_fees_only_when_vat_paused()
    {
        var userId = UserId.New();
        var parcels = new[]
        {
            Parcel.Rehydrate(
                ParcelId.New(), userId, "24789", "Takealot", "T1", "Item A", "Electronics",
                1500m, "10x10x10", ParcelStatus.ReadyToShip, 2m, DateTime.UtcNow),
        };

        var result = QuotePricing.Compute(
            parcels,
            "PUDO",
            BorderBoxPricingSettings.Defaults with { ChargeVat = false });

        Assert.False(result.VatCharged);
        Assert.Equal(150m, result.TotalLandedCost);
    }

    [Fact]
    public void Duty_applies_only_for_parcels_above_threshold()
    {
        var userId = UserId.New();
        var aboveThreshold = new[]
        {
            Parcel.Rehydrate(
                ParcelId.New(), userId, "24789", "Takealot", "T1", "Item A", "Electronics",
                10_001m, "10x10x10", ParcelStatus.ReadyToShip, 2m, DateTime.UtcNow),
        };
        var above = QuotePricing.Compute(aboveThreshold, "PUDO", BorderBoxPricingSettings.Defaults);
        Assert.True(above.DutyCharged);
        Assert.Equal(1600.16m, above.Breakdown.First(l => l.Label.Contains("Import duty", StringComparison.Ordinal)).Amount);
    }

    [Fact]
    public void SplitServiceFee_uses_r50_r100_ratio_within_10_percent()
    {
        var (handling, pickup) = QuotePricing.SplitServiceFee(1500m, BorderBoxPricingSettings.Defaults);
        Assert.Equal(50m, handling);
        Assert.Equal(100m, pickup);
    }

    [Fact]
    public void NormalizeDeliveryMethod_always_returns_pudo()
    {
        Assert.Equal("PUDO", QuotePricing.NormalizeDeliveryMethod("Door-to-Door"));
        Assert.Equal("PUDO", QuotePricing.NormalizeDeliveryMethod("PUDO"));
        Assert.Equal("PUDO", QuotePricing.NormalizeDeliveryMethod(""));
    }
}
