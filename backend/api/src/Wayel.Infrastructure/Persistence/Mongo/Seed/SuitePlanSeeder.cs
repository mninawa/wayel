using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Domain.SuitePlans;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Seeds Starter Pack (R100) and Boost Plan (R250) suite plans.</summary>
internal sealed class SuitePlanSeeder(MongoContext context, ILogger<SuitePlanSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var count = await context.SuitePlans.CountDocumentsAsync(FilterDefinition<SuitePlanDocument>.Empty, cancellationToken: cancellationToken);
        if (count > 0)
        {
            return;
        }

        var monthly = SuitePlan.Create("Starter Pack", durationMonths: 1, priceZar: 100m, isRecommended: false);
        var quarterly = SuitePlan.Create("Boost Plan", durationMonths: 3, priceZar: 250m, isRecommended: true);

        await context.SuitePlans.InsertOneAsync(SuitePlanDocument.From(monthly), cancellationToken: cancellationToken);
        await context.SuitePlans.InsertOneAsync(SuitePlanDocument.From(quarterly), cancellationToken: cancellationToken);

        logger.LogInformation("Seeded WeYell suite plans (monthly + quarterly).");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
