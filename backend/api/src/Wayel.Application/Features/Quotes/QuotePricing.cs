using System.Globalization;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Quotes;

internal sealed record QuotePricingResult(
    decimal DeclaredGoodsValueZar,
    bool DutyCharged,
    bool VatCharged,
    IReadOnlyList<QuoteBreakdownLineDto> Breakdown,
    decimal TotalLandedCost);

/// <summary>
/// BorderBox standard take is 25% of declared goods value: 15% SARS VAT + 10% service fees
/// (payment handling and freight fee, split 50:100). Eswatini import duty is additional
/// when individual items exceed the configured threshold. Goods value is not charged again.
/// </summary>
internal static class QuotePricing
{
    public static QuotePricingResult Compute(
        IReadOnlyList<Parcel> parcels,
        string deliveryMethod,
        BorderBoxPricingSettings config)
    {
        config = config.NormalizeLegacyFields();

        var declaredGoodsValue = parcels.Sum(p => p.DeclaredValueZar ?? 0m);
        var (handlingFee, pickupFee) = SplitServiceFee(declaredGoodsValue, config);
        const decimal insurance = 0m;

        var dutiableGoodsValue = parcels
            .Where(p => (p.DeclaredValueZar ?? 0m) > config.DutyGoodsValueThresholdZar)
            .Sum(p => p.DeclaredValueZar ?? 0m);
        var dutyApplicable = dutiableGoodsValue > 0m;

        var dutyCustomsValuation = dutiableGoodsValue + pickupFee + insurance;
        var duty = dutyApplicable
            ? Math.Round(dutyCustomsValuation * config.DutyRate, 2, MidpointRounding.AwayFromZero)
            : 0m;

        var vatApplicable = config.ChargeVat && declaredGoodsValue > 0m;
        var vat = vatApplicable
            ? Math.Round(declaredGoodsValue * config.VatRate, 2, MidpointRounding.AwayFromZero)
            : 0m;

        var dutyPct = PercentLabel(config.DutyRate);
        var vatPct = PercentLabel(config.VatRate);
        var handlingRate = config.PaymentHandlingFeeRate * config.HandlingFeeShareZar / config.ServiceFeeShareDivisorZar;
        var pickupRate = config.PaymentHandlingFeeRate * config.PickupFeeShareZar / config.ServiceFeeShareDivisorZar;

        var breakdown = new List<QuoteBreakdownLineDto>
        {
            new(FeeLabel("Handling fee", handlingRate), handlingFee),
            new(FeeLabel("Freight fee", pickupRate), pickupFee),
        };

        if (dutyApplicable)
        {
            breakdown.Insert(
                0,
                new($"Import duty — Eswatini ({dutyPct})", duty));
        }

        if (vatApplicable)
        {
            breakdown.Insert(
                dutyApplicable ? 1 : 0,
                new(FeeLabel("VAT", config.VatRate), vat));
        }

        if (declaredGoodsValue > 0m)
        {
            breakdown.Insert(
                0,
                new("Goods value (paid to retailer)", declaredGoodsValue, IncludedInTotal: false));
        }

        var total = duty + vat + handlingFee + pickupFee;
        return new QuotePricingResult(declaredGoodsValue, dutyApplicable, vatApplicable, breakdown, total);
    }

    public static decimal EstimateTotal(
        IReadOnlyList<Parcel> parcels,
        string deliveryMethod,
        BorderBoxPricingSettings config) =>
        Compute(parcels, deliveryMethod, config).TotalLandedCost;

    public static IReadOnlyList<QuoteBreakdownLineDto> BuildBreakdown(
        IReadOnlyList<Parcel> parcels,
        string deliveryMethod,
        BorderBoxPricingSettings config) =>
        Compute(parcels, deliveryMethod, config).Breakdown;

    public static string NormalizeDeliveryMethod(string deliveryMethod) =>
        "PUDO";

    public static string DeliveryEstimate(string deliveryMethod) =>
        "6–8 working days";

    internal static (decimal Handling, decimal Pickup) SplitServiceFee(
        decimal declaredGoodsValue,
        BorderBoxPricingSettings config)
    {
        if (declaredGoodsValue <= 0m)
        {
            return (0m, 0m);
        }

        var serviceTotal = Math.Round(
            declaredGoodsValue * config.PaymentHandlingFeeRate,
            2,
            MidpointRounding.AwayFromZero);
        var divisor = config.ServiceFeeShareDivisorZar;
        if (divisor <= 0m)
        {
            return (serviceTotal, 0m);
        }

        var pickup = Math.Round(
            serviceTotal * config.PickupFeeShareZar / divisor,
            2,
            MidpointRounding.AwayFromZero);
        var handling = serviceTotal - pickup;
        return (handling, pickup);
    }

    private static string FeeLabel(string name, decimal rateOfGoods) =>
        $"{name} ({PercentLabel(rateOfGoods)})";

    private static string PercentLabel(decimal rate)
    {
        var pct = Math.Round(rate * 100m, rate % 0.01m == 0 ? 0 : 1, MidpointRounding.AwayFromZero);
        return string.Create(CultureInfo.InvariantCulture, $"{pct}%");
    }
}
