using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Quotes;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Seeds the singleton BorderBox pricing config document when missing.</summary>
internal sealed class BorderBoxPricingConfigSeeder(
    IServiceScopeFactory scopeFactory,
    IOptions<BorderBoxPricingOptions> legacyOptions,
    ILogger<BorderBoxPricingConfigSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<IBorderBoxPricingConfigRepository>();

        var legacy = legacyOptions.Value;
        var existing = await repository.GetAsync(cancellationToken);
        if (existing is not null)
        {
            var normalized = existing.NormalizeLegacyFields();
            if (normalized.ChargeVat != legacy.ChargeVat
                || normalized.ChargeWeightSurcharge != legacy.ChargeWeightSurcharge)
            {
                var synced = normalized with
                {
                    ChargeVat = legacy.ChargeVat,
                    ChargeWeightSurcharge = legacy.ChargeWeightSurcharge,
                    UpdatedAtUtc = DateTime.UtcNow,
                };
                await repository.SaveAsync(synced, cancellationToken);
                logger.LogInformation(
                    "Synced BorderBox pricing toggles from environment (ChargeVat={ChargeVat}, ChargeWeightSurcharge={WeightSurcharge}).",
                    synced.ChargeVat,
                    synced.ChargeWeightSurcharge);
            }

            return;
        }

        var initial = BorderBoxPricingSettings.Defaults with
        {
            ChargeVat = legacy.ChargeVat,
            ChargeWeightSurcharge = legacy.ChargeWeightSurcharge,
            UpdatedAtUtc = DateTime.UtcNow,
        };

        await repository.SaveAsync(initial, cancellationToken);
        logger.LogInformation(
            "Seeded BorderBox pricing config (ChargeVat={ChargeVat}, ChargeWeightSurcharge={WeightSurcharge}).",
            initial.ChargeVat,
            initial.ChargeWeightSurcharge);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
