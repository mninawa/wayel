using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Warehouse;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Ensures every subscribed suite has a warehouse postbox location (SUITE-{number}).</summary>
internal sealed class SuiteLocationSyncSeeder(
    MongoContext context,
    IServiceScopeFactory scopeFactory,
    ILogger<SuiteLocationSyncSeeder> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(SuiteLocationSyncSeeder),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var docs = await context.SuiteSubscriptions
            .Find(FilterDefinition<SuiteSubscriptionDocument>.Empty)
            .ToListAsync(cancellationToken);

        var suiteNumbers = docs
            .Select(d => d.SuiteNumber?.Trim())
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (suiteNumbers.Count == 0)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var locations = scope.ServiceProvider.GetRequiredService<IWarehouseLocationRepository>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();

        var created = 0;
        foreach (var suite in suiteNumbers)
        {
            var locationId = $"SUITE-{suite!}";
            var before = await locations.GetByIdAsync(locationId, cancellationToken);
            await SuiteLocationProvisioner.EnsureAsync(suite!, locations, clock, cancellationToken);
            if (before is null)
            {
                created++;
            }
        }

        if (created > 0)
        {
            logger.LogInformation("Provisioned {Count} suite postbox warehouse location(s).", created);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
