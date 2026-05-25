using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Domain.PickupBranches;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Seeds default Eswatini pickup branches when the collection is empty.</summary>
internal sealed class PickupBranchSeeder(MongoContext context, ILogger<PickupBranchSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var count = await context.PickupBranches.CountDocumentsAsync(
            FilterDefinition<PickupBranchDocument>.Empty,
            cancellationToken: cancellationToken);
        if (count > 0)
        {
            return;
        }

        var branches = new[]
        {
            PickupBranch.Create(
                "mbabane-plaza",
                "Mbabane Plaza",
                "Mbabane Plaza Shopping Centre",
                null,
                "Mbabane",
                "Hhohho Region",
                "WeYell pickup point — collect your parcels at Mbabane Plaza.",
                sortOrder: 1),
            PickupBranch.Create(
                "manzini-hub",
                "Manzini Hub",
                "Matsapha Road",
                "Near NRZ Industrial",
                "Manzini",
                "Manzini Region",
                "WeYell pickup point in Manzini.",
                sortOrder: 2),
            PickupBranch.Create(
                "siteki-branch",
                "Siteki Branch",
                "Main Street",
                null,
                "Siteki",
                "Lubombo Region",
                "WeYell pickup point in Siteki.",
                sortOrder: 3),
            PickupBranch.Create(
                "nhlangano-branch",
                "Nhlangano Branch",
                "Nhlangano Town Centre",
                null,
                "Nhlangano",
                "Shiselweni Region",
                "WeYell pickup point in Nhlangano.",
                sortOrder: 4),
        };

        await context.PickupBranches.InsertManyAsync(
            branches.Select(PickupBranchDocument.From),
            cancellationToken: cancellationToken);

        logger.LogInformation("Seeded {Count} WeYell Eswatini pickup branches.", branches.Length);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
