using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Sessions;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoRefreshTokenRepository(
    MongoContext context,
    IDomainEventCollector events) : IRefreshTokenRepository
{
    public async Task<RefreshToken?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken)
    {
        var doc = await context.RefreshTokens
            .Find(x => x.TokenHash == tokenHash)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task AddAsync(RefreshToken token, CancellationToken cancellationToken)
    {
        await context.RefreshTokens.InsertOneAsync(
            RefreshTokenDocument.FromDomain(token),
            cancellationToken: cancellationToken);
        events.CollectFrom(token);
    }

    public async Task UpdateAsync(RefreshToken token, CancellationToken cancellationToken)
    {
        await context.RefreshTokens.ReplaceOneAsync(
            x => x.Id == token.Id,
            RefreshTokenDocument.FromDomain(token),
            cancellationToken: cancellationToken);
        events.CollectFrom(token);
    }

    public async Task RevokeSessionAsync(string sessionId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var filter = Builders<RefreshTokenDocument>.Filter.And(
            Builders<RefreshTokenDocument>.Filter.Eq(x => x.SessionId, sessionId),
            Builders<RefreshTokenDocument>.Filter.Eq(x => x.RevokedOnUtc, null));

        var update = Builders<RefreshTokenDocument>.Update.Set(x => x.RevokedOnUtc, nowUtc);
        await context.RefreshTokens.UpdateManyAsync(filter, update, cancellationToken: cancellationToken);
    }

    public async Task RevokeAllForUserAsync(UserId userId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var filter = Builders<RefreshTokenDocument>.Filter.And(
            Builders<RefreshTokenDocument>.Filter.Eq(x => x.UserId, userId),
            Builders<RefreshTokenDocument>.Filter.Eq(x => x.RevokedOnUtc, null));

        var update = Builders<RefreshTokenDocument>.Update.Set(x => x.RevokedOnUtc, nowUtc);
        await context.RefreshTokens.UpdateManyAsync(filter, update, cancellationToken: cancellationToken);
    }
}
