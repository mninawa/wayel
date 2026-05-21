using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuitePlans;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuitePlanRepository(MongoContext context) : ISuitePlanRepository
{
    public async Task<IReadOnlyList<SuitePlan>> ListActiveAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.SuitePlans.Find(x => x.IsActive).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<SuitePlan?> GetByIdAsync(SuitePlanId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.SuitePlans.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }
}
