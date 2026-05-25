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

    public async Task<SuiteSubscription?> GetBySuiteNumberAsync(
        string suiteNumber,
        CancellationToken cancellationToken = default)
    {
        var normalized = suiteNumber.Trim();
        if (string.IsNullOrEmpty(normalized))
        {
            return null;
        }

        var doc = await context.SuiteSubscriptions
            .Find(x => x.SuiteNumber == normalized)
            .FirstOrDefaultAsync(cancellationToken);
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

    public async Task<int> CountAssignedSuitesAsync(CancellationToken cancellationToken = default)
    {
        var count = await context.SuiteSubscriptions
            .CountDocumentsAsync(
                x => !string.IsNullOrEmpty(x.SuiteNumber),
                cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task<int> CountAssignedSuitesByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var normalized = regionCode.Trim().ToUpperInvariant();
        var userIds = await context.Users
            .Find(x => x.DestinationCountry == normalized)
            .Project(x => x.Id)
            .ToListAsync(cancellationToken);

        if (userIds.Count == 0)
        {
            return 0;
        }

        var count = await context.SuiteSubscriptions.CountDocumentsAsync(
            x => userIds.Contains(x.UserId) && !string.IsNullOrEmpty(x.SuiteNumber),
            cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task<IReadOnlyList<UserId>> ListActiveSuiteUserIdsByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var normalized = regionCode.Trim().ToUpperInvariant();
        var userIds = await context.Users
            .Find(x => x.DestinationCountry == normalized)
            .Project(x => x.Id)
            .ToListAsync(cancellationToken);

        if (userIds.Count == 0)
        {
            return [];
        }

        var activeUserIds = await context.SuiteSubscriptions
            .Find(x =>
                userIds.Contains(x.UserId)
                && !string.IsNullOrEmpty(x.SuiteNumber)
                && x.Status != SuiteAccessStatus.PendingPayment
                && x.Status != SuiteAccessStatus.Suspended)
            .Project(x => x.UserId)
            .ToListAsync(cancellationToken);

        return activeUserIds;
    }
}
