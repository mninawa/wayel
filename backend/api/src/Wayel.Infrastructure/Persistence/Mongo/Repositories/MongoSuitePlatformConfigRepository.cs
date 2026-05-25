using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuitePlatformConfigRepository(MongoContext context)
    : ISuitePlatformConfigRepository
{
    public async Task<SuitePlatformSettings?> GetByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var region = SuitePlatformRegions.Normalize(regionCode);
        var doc = await context.SuitePlatformConfig
            .Find(x => x.Id == region)
            .FirstOrDefaultAsync(cancellationToken);

        if (doc is not null)
        {
            return doc.ToDomain();
        }

        if (string.Equals(region, "SZ", StringComparison.Ordinal))
        {
            var legacy = await context.SuitePlatformConfig
                .Find(x => x.Id == SuitePlatformSettings.LegacySingletonId)
                .FirstOrDefaultAsync(cancellationToken);
            if (legacy is not null)
            {
                var migrated = legacy.ToDomain() with { RegionCode = "SZ" };
                await SaveAsync(migrated, cancellationToken);
                return migrated;
            }
        }

        return null;
    }

    public async Task<IReadOnlyList<SuitePlatformSettings>> ListAsync(
        CancellationToken cancellationToken = default)
    {
        var docs = await context.SuitePlatformConfig
            .Find(Builders<SuitePlatformConfigDocument>.Filter.Empty)
            .ToListAsync(cancellationToken);

        var byRegion = docs
            .Where(d => !string.Equals(d.Id, SuitePlatformSettings.LegacySingletonId, StringComparison.Ordinal))
            .GroupBy(d => SuitePlatformRegions.Normalize(d.RegionCode))
            .ToDictionary(g => g.Key, g => g.First().ToDomain());

        return SuitePlatformRegions.Supported
            .Select(region => byRegion.TryGetValue(region, out var settings)
                ? settings
                : SuitePlatformSettings.ForRegion(region))
            .ToList();
    }

    public async Task SaveAsync(
        SuitePlatformSettings settings,
        CancellationToken cancellationToken = default)
    {
        var doc = SuitePlatformConfigDocument.From(settings);
        await context.SuitePlatformConfig.ReplaceOneAsync(
            x => x.Id == doc.Id,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    public async Task<long> AllocateNextSequenceAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var region = SuitePlatformRegions.Normalize(regionCode);
        var update = Builders<SuitePlatformConfigDocument>.Update.Inc(x => x.NextSequenceNumber, 1);
        var options = new FindOneAndUpdateOptions<SuitePlatformConfigDocument>
        {
            ReturnDocument = ReturnDocument.After,
            IsUpsert = true,
        };

        var doc = await context.SuitePlatformConfig.FindOneAndUpdateAsync(
            x => x.Id == region,
            update,
            options,
            cancellationToken);

        if (doc is null)
        {
            var defaults = SuitePlatformConfigDocument.From(SuitePlatformSettings.ForRegion(region));
            defaults.NextSequenceNumber = 1;
            await context.SuitePlatformConfig.ReplaceOneAsync(
                x => x.Id == region,
                defaults,
                new ReplaceOptions { IsUpsert = true },
                cancellationToken);
            return 1;
        }

        return doc.NextSequenceNumber;
    }
}
