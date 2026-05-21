using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoUserRepository(MongoContext context, IDomainEventCollector events) : IUserRepository
{
    public async Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Users.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalised = email.Trim().ToLowerInvariant();
        var doc = await context.Users.Find(x => x.Email == normalised).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<bool> ExistsForEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalised = email.Trim().ToLowerInvariant();
        var count = await context.Users.CountDocumentsAsync(x => x.Email == normalised, cancellationToken: cancellationToken);
        return count > 0;
    }

    public async Task AddAsync(User user, CancellationToken cancellationToken = default)
    {
        await context.Users.InsertOneAsync(UserDocument.FromDomain(user), cancellationToken: cancellationToken);
        events.CollectFrom(user);
    }

    public async Task UpdateAsync(User user, CancellationToken cancellationToken = default)
    {
        await context.Users.ReplaceOneAsync(x => x.Id == user.Id, UserDocument.FromDomain(user), cancellationToken: cancellationToken);
        events.CollectFrom(user);
    }
}
