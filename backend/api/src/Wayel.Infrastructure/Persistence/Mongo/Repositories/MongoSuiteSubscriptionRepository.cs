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

    public async Task<IReadOnlyList<SuiteNumberDuplicateGroup>> ListSuiteNumberDuplicatesAsync(
        CancellationToken cancellationToken = default)
    {
        var assigned = await context.SuiteSubscriptions
            .Find(x => !string.IsNullOrEmpty(x.SuiteNumber))
            .ToListAsync(cancellationToken);

        var groups = assigned
            .GroupBy(x => x.SuiteNumber, StringComparer.Ordinal)
            .Where(g => g.Count() > 1)
            .ToList();

        if (groups.Count == 0)
        {
            return [];
        }

        var userIds = groups.SelectMany(g => g).Select(x => x.UserId).Distinct().ToList();
        var users = await context.Users
            .Find(u => userIds.Contains(u.Id))
            .ToListAsync(cancellationToken);
        var usersById = users.ToDictionary(u => u.Id);

        var result = new List<SuiteNumberDuplicateGroup>(groups.Count);
        foreach (var group in groups)
        {
            // Order by StartedAt so Members[0] is always the rightful owner —
            // the ops UI can flag the first row "Keep" and the rest "Reassign"
            // without further sorting on the client.
            var ordered = group
                .OrderBy(x => x.StartedAt ?? DateTime.MaxValue)
                .ThenBy(x => x.UserId.Value)
                .ToList();

            var members = new List<SuiteNumberDuplicateMember>(ordered.Count);
            foreach (var sub in ordered)
            {
                if (!usersById.TryGetValue(sub.UserId, out var user))
                {
                    continue;
                }

                members.Add(new SuiteNumberDuplicateMember(
                    sub.UserId,
                    user.Email,
                    string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName,
                    user.DestinationCountry ?? string.Empty,
                    sub.Id,
                    sub.Status,
                    sub.StartedAt,
                    sub.ExpiresAt));
            }

            if (members.Count > 1)
            {
                result.Add(new SuiteNumberDuplicateGroup(group.Key, members));
            }
        }

        return result;
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
