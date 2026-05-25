using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.OpsAuth;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoOpsUserRepository(MongoContext context) : IOpsUserRepository
{
    public async Task<OpsUserRecord?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var doc = await context.OpsUsers.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<OpsUserRecord?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = OpsEmailNormalizer.Normalize(email);
        var doc = await context.OpsUsers
            .Find(x => x.Email == normalized)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<OpsUserRecord?> GetByGoogleSubjectAsync(
        string googleSubject,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.OpsUsers
            .Find(x => x.GoogleSubject == googleSubject)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<IReadOnlyList<OpsUserRecord>> ListAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.OpsUsers.Find(FilterDefinition<OpsUserDocument>.Empty)
            .SortByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToRecord()).ToList();
    }

    public Task AddAsync(OpsUserRecord user, CancellationToken cancellationToken = default) =>
        context.OpsUsers.InsertOneAsync(OpsUserDocument.From(user), cancellationToken: cancellationToken);

    public Task ReplaceAsync(OpsUserRecord user, CancellationToken cancellationToken = default) =>
        context.OpsUsers.ReplaceOneAsync(
            x => x.Id == user.Id,
            OpsUserDocument.From(user),
            cancellationToken: cancellationToken);

}
