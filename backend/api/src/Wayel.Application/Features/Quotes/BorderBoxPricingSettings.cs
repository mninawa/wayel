namespace Wayel.Application.Features.Quotes;

/// <summary>
/// BorderBox quote pricing knobs (persisted in Mongo for future admin UI).
/// </summary>
public sealed record BorderBoxPricingSettings(
    bool ChargeVat,
    bool ChargeWeightSurcharge,
    decimal PudoFlatFeeZar,
    decimal DoorToDoorFlatFeeZar,
    decimal PerKgSurchargeZar,
    decimal DutyRate,
    decimal VatRate,
    decimal DutyGoodsValueThresholdZar,
    decimal PaymentHandlingFeeRate,
    decimal HandlingFeeShareZar,
    decimal PickupFeeShareZar,
    DateTime UpdatedAtUtc)
{
    public const string SingletonId = "default";

    /// <summary>Eswatini import duty applies only to line items whose declared value exceeds this amount (ZAR).</summary>
    public const decimal DefaultDutyGoodsValueThresholdZar = 10_000m;

    /// <summary>Combined service fee rate (handling + freight) on declared goods value.</summary>
    public const decimal DefaultPaymentHandlingFeeRate = 0.10m;

    public const decimal DefaultVatRate = 0.15m;

    /// <summary>Standard 25% take = 15% VAT + 10% service fees, split R50 handling : R100 freight.</summary>
    public const decimal DefaultHandlingFeeShareZar = 50m;

    public const decimal DefaultPickupFeeShareZar = 100m;

    public decimal ServiceFeeShareDivisorZar => HandlingFeeShareZar + PickupFeeShareZar;

    public static BorderBoxPricingSettings Defaults { get; } = new(
        ChargeVat: true,
        ChargeWeightSurcharge: false,
        PudoFlatFeeZar: 100m,
        DoorToDoorFlatFeeZar: 100m,
        PerKgSurchargeZar: 12m,
        DutyRate: 0.15m,
        VatRate: DefaultVatRate,
        DutyGoodsValueThresholdZar: DefaultDutyGoodsValueThresholdZar,
        PaymentHandlingFeeRate: DefaultPaymentHandlingFeeRate,
        HandlingFeeShareZar: DefaultHandlingFeeShareZar,
        PickupFeeShareZar: DefaultPickupFeeShareZar,
        UpdatedAtUtc: DateTime.UtcNow);

    public BorderBoxPricingSettings NormalizeLegacyFields()
    {
        var withThreshold = DutyGoodsValueThresholdZar > 0
            ? this
            : this with { DutyGoodsValueThresholdZar = DefaultDutyGoodsValueThresholdZar };
        var withServiceRate = withThreshold.PaymentHandlingFeeRate > 0
            ? withThreshold
            : withThreshold with { PaymentHandlingFeeRate = DefaultPaymentHandlingFeeRate };
        var withShares = withServiceRate with
        {
            HandlingFeeShareZar = HandlingFeeShareZar > 0
                ? HandlingFeeShareZar
                : DefaultHandlingFeeShareZar,
            PickupFeeShareZar = PickupFeeShareZar > 0
                ? PickupFeeShareZar
                : DefaultPickupFeeShareZar,
        };
        return withShares.VatRate > 0
            ? withShares
            : withShares with { VatRate = DefaultVatRate };
    }

    public BorderBoxPricingConfigDto ToDto() =>
        new(
            ChargeVat,
            ChargeWeightSurcharge,
            PudoFlatFeeZar,
            DoorToDoorFlatFeeZar,
            PerKgSurchargeZar,
            DutyRate,
            VatRate,
            DutyGoodsValueThresholdZar,
            PaymentHandlingFeeRate,
            HandlingFeeShareZar,
            PickupFeeShareZar,
            UpdatedAtUtc);
}
