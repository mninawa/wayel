using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Domain.SuitePlans;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Seeds Monthly (R100) and Quarterly (R200) suite plans.</summary>
internal sealed class SuitePlanSeeder(MongoContext context, ILogger<SuitePlanSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var count = await context.SuitePlans.CountDocumentsAsync(FilterDefinition<SuitePlanDocument>.Empty, cancellationToken: cancellationToken);
        if (count > 0)
        {
            return;
        }

        var monthly = SuitePlan.Create("Monthly Suite Access", durationMonths: 1, priceZar: 100m, isRecommended: false);
        var quarterly = SuitePlan.Create("Quarterly Suite Access", durationMonths: 3, priceZar: 200m, isRecommended: true);

        await context.SuitePlans.InsertOneAsync(SuitePlanDocument.From(monthly), cancellationToken: cancellationToken);
        await context.SuitePlans.InsertOneAsync(SuitePlanDocument.From(quarterly), cancellationToken: cancellationToken);

        logger.LogInformation("Seeded WeYell suite plans (monthly + quarterly).");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
