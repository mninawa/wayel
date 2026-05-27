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
                "Mbabane New Mall",
                "New Mall, First Floor, Suite 101",
                "Dr Sishayi Road",
                "Mbabane",
                "Hhohho Region",
                "WeYell pickup point at New Mall, Mbabane — collect your parcels on the first floor.",
                sortOrder: 1,
                poBox: "P.O. Box 1988",
                postalCode: "H100",
                countryCode: "SZ",
                phone: "+268 3454 1872",
                phoneAlt: "+268 7842 5197",
                latitude: -26.3197,
                longitude: 31.1345),
            PickupBranch.Create(
                "manzini-hub",
                "Manzini Hub",
                "Matsapha Road",
                "Near NRZ Industrial",
                "Manzini",
                "Manzini Region",
                "WeYell pickup point in Manzini.",
                sortOrder: 2,
                countryCode: "SZ",
                latitude: -26.4833,
                longitude: 31.3667),
            PickupBranch.Create(
                "siteki-branch",
                "Siteki Branch",
                "Main Street",
                null,
                "Siteki",
                "Lubombo Region",
                "WeYell pickup point in Siteki.",
                sortOrder: 3,
                countryCode: "SZ",
                latitude: -26.9833,
                longitude: 31.95),
            PickupBranch.Create(
                "nhlangano-branch",
                "Nhlangano Branch",
                "Nhlangano Town Centre",
                null,
                "Nhlangano",
                "Shiselweni Region",
                "WeYell pickup point in Nhlangano.",
                sortOrder: 4,
                countryCode: "SZ",
                latitude: -27.1167,
                longitude: 31.2),
        };

        await context.PickupBranches.InsertManyAsync(
            branches.Select(PickupBranchDocument.From),
            cancellationToken: cancellationToken);

        logger.LogInformation("Seeded {Count} WeYell Eswatini pickup branches.", branches.Length);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
