using Wayel.Application.Features.Quotes;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class BorderBoxPricingConfigDocument
{
    public string Id { get; set; } = BorderBoxPricingSettings.SingletonId;
    public bool ChargeVat { get; set; }
    public bool ChargeWeightSurcharge { get; set; }
    public decimal PudoFlatFeeZar { get; set; }
    public decimal DoorToDoorFlatFeeZar { get; set; }
    public decimal PerKgSurchargeZar { get; set; }
    public decimal DutyRate { get; set; }
    public decimal VatRate { get; set; }
    public decimal DutyGoodsValueThresholdZar { get; set; }
    public decimal PaymentHandlingFeeRate { get; set; }
    public decimal HandlingFeeShareZar { get; set; }
    public decimal PickupFeeShareZar { get; set; }

    /// <summary>Legacy flat ZAR fee — ignored.</summary>
    public decimal PaymentHandlingFeeZar { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public static BorderBoxPricingConfigDocument From(BorderBoxPricingSettings s) =>
        new()
        {
            Id = BorderBoxPricingSettings.SingletonId,
            ChargeVat = s.ChargeVat,
            ChargeWeightSurcharge = s.ChargeWeightSurcharge,
            PudoFlatFeeZar = s.PudoFlatFeeZar,
            DoorToDoorFlatFeeZar = s.DoorToDoorFlatFeeZar,
            PerKgSurchargeZar = s.PerKgSurchargeZar,
            DutyRate = s.DutyRate,
            VatRate = s.VatRate,
            DutyGoodsValueThresholdZar = s.DutyGoodsValueThresholdZar,
            PaymentHandlingFeeRate = s.PaymentHandlingFeeRate,
            HandlingFeeShareZar = s.HandlingFeeShareZar,
            PickupFeeShareZar = s.PickupFeeShareZar,
            PaymentHandlingFeeZar = 0,
            UpdatedAtUtc = s.UpdatedAtUtc,
        };

    public BorderBoxPricingSettings ToDomain() =>
        new BorderBoxPricingSettings(
            ChargeVat,
            ChargeWeightSurcharge,
            PudoFlatFeeZar,
            DoorToDoorFlatFeeZar,
            PerKgSurchargeZar,
            DutyRate,
            VatRate,
            DutyGoodsValueThresholdZar,
            PaymentHandlingFeeRate > 0 ? PaymentHandlingFeeRate : BorderBoxPricingSettings.DefaultPaymentHandlingFeeRate,
            HandlingFeeShareZar,
            PickupFeeShareZar,
            UpdatedAtUtc).NormalizeLegacyFields();

}
