using Wayel.Application.Features.Quotes;

namespace Wayel.Application.Configuration;

/// <summary>
/// Bootstrap values used only when seeding the Mongo <c>borderbox_pricing_config</c>
/// document on first run. Runtime pricing reads from
/// <see cref="Abstractions.Persistence.IBorderBoxPricingConfigRepository"/>.
/// </summary>
public sealed class BorderBoxPricingOptions
{
    public const string SectionName = "BorderBox:Pricing";

    /// <summary>
    /// When true, VAT is charged on quotes whose total declared goods value exceeds
    /// <see cref="DutyGoodsValueThresholdZar"/>. When false, VAT is paused on all quotes.
    /// </summary>
    public bool ChargeVat { get; init; }

    /// <summary>
    /// When true, freight adds R12 per kg above the first kg (on top of PUDO/Door-to-Door base).
    /// When false, PUDO is a flat R180 and Door-to-Door a flat R240.
    /// </summary>
    public bool ChargeWeightSurcharge { get; init; }

    /// <summary>
    /// Eswatini import duty applies only to parcels whose declared value exceeds this amount (ZAR).
    /// </summary>
    public decimal DutyGoodsValueThresholdZar { get; init; } = BorderBoxPricingSettings.DefaultDutyGoodsValueThresholdZar;
}
