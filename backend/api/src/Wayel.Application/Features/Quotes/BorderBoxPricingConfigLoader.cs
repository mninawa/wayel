using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Configuration;

namespace Wayel.Application.Features.Quotes;

internal static class BorderBoxPricingConfigLoader
{
    public static async Task<BorderBoxPricingSettings> LoadAsync(
        IBorderBoxPricingConfigRepository repository,
        IOptions<BorderBoxPricingOptions> pricingOptions,
        CancellationToken cancellationToken)
    {
        var stored = (await repository.GetAsync(cancellationToken)) ?? BorderBoxPricingSettings.Defaults;
        return ApplyEnvironmentToggles(stored.NormalizeLegacyFields(), pricingOptions.Value);
    }

    internal static BorderBoxPricingSettings ApplyEnvironmentToggles(
        BorderBoxPricingSettings settings,
        BorderBoxPricingOptions options) =>
        settings with
        {
            ChargeVat = options.ChargeVat,
            ChargeWeightSurcharge = options.ChargeWeightSurcharge,
            DutyGoodsValueThresholdZar = options.DutyGoodsValueThresholdZar > 0
                ? options.DutyGoodsValueThresholdZar
                : settings.DutyGoodsValueThresholdZar,
        };
}
