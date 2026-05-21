using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuiteSubscriptionRepository(MongoContext context, IDomainEventCollector events) : ISuiteSubscriptionRepository
{
    public async Task<SuiteSubscription?> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var doc = await context.SuiteSubscriptions.Find(x => x.UserId == userId).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task AddAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default)
    {
        await context.SuiteSubscriptions.InsertOneAsync(SuiteSubscriptionDocument.From(subscription), cancellationToken: cancellationToken);
        events.CollectFrom(subscription);
    }

    public async Task UpdateAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default)
    {
        await context.SuiteSubscriptions.ReplaceOneAsync(x => x.Id == subscription.Id, SuiteSubscriptionDocument.From(subscription), cancellationToken: cancellationToken);
        events.CollectFrom(subscription);
    }
}
