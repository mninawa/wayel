using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.PickupBranches;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoPickupBranchRepository(MongoContext context) : IPickupBranchRepository
{
    public async Task<IReadOnlyList<PickupBranch>> ListActiveAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.PickupBranches
            .Find(x => x.IsActive)
            .SortBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<PickupBranch>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.PickupBranches
            .Find(FilterDefinition<PickupBranchDocument>.Empty)
            .SortBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<PickupBranch?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        var normalized = id.Trim().ToLowerInvariant();
        var doc = await context.PickupBranches
            .Find(x => x.Id == normalized)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }
}
