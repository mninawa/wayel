using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuitePlans;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuitePlanRepository(MongoContext context) : ISuitePlanRepository
{
    public async Task<IReadOnlyList<SuitePlan>> ListActiveAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.SuitePlans.Find(x => x.IsActive).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<SuitePlan>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.SuitePlans
            .Find(FilterDefinition<SuitePlanDocument>.Empty)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<SuitePlan?> GetByIdAsync(SuitePlanId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.SuitePlans.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public Task AddAsync(SuitePlan plan, CancellationToken cancellationToken = default) =>
        context.SuitePlans.InsertOneAsync(SuitePlanDocument.From(plan), cancellationToken: cancellationToken);

    public async Task UpdateAsync(SuitePlan plan, CancellationToken cancellationToken = default)
    {
        await context.SuitePlans.ReplaceOneAsync(
            x => x.Id == plan.Id,
            SuitePlanDocument.From(plan),
            new ReplaceOptions { IsUpsert = false },
            cancellationToken);
    }
}
