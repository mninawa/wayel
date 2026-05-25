using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.Quotes;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoBorderBoxPricingConfigRepository(MongoContext context)
    : IBorderBoxPricingConfigRepository
{
    public async Task<BorderBoxPricingSettings?> GetAsync(CancellationToken cancellationToken = default)
    {
        var doc = await context.BorderBoxPricingConfig
            .Find(x => x.Id == BorderBoxPricingSettings.SingletonId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task SaveAsync(BorderBoxPricingSettings settings, CancellationToken cancellationToken = default)
    {
        var doc = BorderBoxPricingConfigDocument.From(settings);
        await context.BorderBoxPricingConfig.ReplaceOneAsync(
            x => x.Id == BorderBoxPricingSettings.SingletonId,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }
}
