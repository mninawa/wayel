using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Domain.PickupBranches;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Upserts canonical pickup branch details (address, geo, contact) so existing
/// deployments pick up location corrections without manual DB edits.
/// </summary>
internal sealed class PickupBranchLocationMigrator(
    MongoContext context,
    ILogger<PickupBranchLocationMigrator> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(PickupBranchLocationMigrator),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var canonical = CanonicalBranches();
        var updated = 0;

        foreach (var branch in canonical)
        {
            var doc = PickupBranchDocument.From(branch);
            var filter = Builders<PickupBranchDocument>.Filter.Eq(x => x.Id, doc.Id);
            var update = Builders<PickupBranchDocument>.Update
                .Set(x => x.Name, doc.Name)
                .Set(x => x.Line1, doc.Line1)
                .Set(x => x.Line2, doc.Line2)
                .Set(x => x.City, doc.City)
                .Set(x => x.Region, doc.Region)
                .Set(x => x.Description, doc.Description)
                .Set(x => x.SortOrder, doc.SortOrder)
                .Set(x => x.PoBox, doc.PoBox)
                .Set(x => x.PostalCode, doc.PostalCode)
                .Set(x => x.CountryCode, doc.CountryCode)
                .Set(x => x.Phone, doc.Phone)
                .Set(x => x.PhoneAlt, doc.PhoneAlt)
                .Set(x => x.Latitude, doc.Latitude)
                .Set(x => x.Longitude, doc.Longitude)
                .Set(x => x.GooglePlaceId, doc.GooglePlaceId)
                .SetOnInsert(x => x.IsActive, true);

            var result = await context.PickupBranches.UpdateOneAsync(
                filter,
                update,
                new UpdateOptions { IsUpsert = true },
                cancellationToken);

            if (result.ModifiedCount > 0 || result.UpsertedId is not null)
            {
                updated++;
            }
        }

        if (updated > 0)
        {
            logger.LogInformation(
                "Pickup branch location migrator upserted {Count} canonical branches.",
                updated);
        }
    }

    private static PickupBranch[] CanonicalBranches() =>
    [
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
    ];

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
