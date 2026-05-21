using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoExternalIdentityRepository(
    MongoContext context,
    IDomainEventCollector events) : IExternalIdentityRepository
{
    public async Task<ExternalIdentity?> GetByProviderSubjectAsync(
        IdentityProvider provider,
        string providerSubject,
        CancellationToken cancellationToken)
    {
        var doc = await context.ExternalIdentities
            .Find(x => x.Provider == provider && x.ProviderSubject == providerSubject)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<IReadOnlyList<ExternalIdentity>> GetForUserAsync(
        UserId userId,
        CancellationToken cancellationToken)
    {
        var docs = await context.ExternalIdentities
            .Find(x => x.UserId == userId)
            .ToListAsync(cancellationToken);
        return docs.ConvertAll(x => x.ToDomain());
    }

    public async Task AddAsync(ExternalIdentity identity, CancellationToken cancellationToken)
    {
        await context.ExternalIdentities.InsertOneAsync(
            ExternalIdentityDocument.FromDomain(identity),
            cancellationToken: cancellationToken);
        events.CollectFrom(identity);
    }

    public async Task UpdateAsync(ExternalIdentity identity, CancellationToken cancellationToken)
    {
        await context.ExternalIdentities.ReplaceOneAsync(
            x => x.Id == identity.Id,
            ExternalIdentityDocument.FromDomain(identity),
            cancellationToken: cancellationToken);
        events.CollectFrom(identity);
    }
}
