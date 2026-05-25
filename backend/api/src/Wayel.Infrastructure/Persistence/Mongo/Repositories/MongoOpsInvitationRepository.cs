using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.OpsAuth;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoOpsInvitationRepository(MongoContext context) : IOpsInvitationRepository
{
    public async Task<OpsInvitationRecord?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var doc = await context.OpsInvitations.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<OpsInvitationRecord?> GetByTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        var doc = await context.OpsInvitations
            .Find(x => x.Token == token)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<OpsInvitationRecord?> GetPendingByEmailAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        var normalized = OpsEmailNormalizer.Normalize(email);
        var doc = await context.OpsInvitations
            .Find(x => x.Email == normalized && x.Status == "Pending")
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToRecord();
    }

    public async Task<IReadOnlyList<OpsInvitationRecord>> ListAsync(CancellationToken cancellationToken = default)
    {
        var docs = await context.OpsInvitations.Find(FilterDefinition<OpsInvitationDocument>.Empty)
            .SortByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToRecord()).ToList();
    }

    public Task AddAsync(OpsInvitationRecord invitation, CancellationToken cancellationToken = default) =>
        context.OpsInvitations.InsertOneAsync(
            OpsInvitationDocument.From(invitation),
            cancellationToken: cancellationToken);

    public Task ReplaceAsync(OpsInvitationRecord invitation, CancellationToken cancellationToken = default) =>
        context.OpsInvitations.ReplaceOneAsync(
            x => x.Id == invitation.Id,
            OpsInvitationDocument.From(invitation),
            cancellationToken: cancellationToken);
}
