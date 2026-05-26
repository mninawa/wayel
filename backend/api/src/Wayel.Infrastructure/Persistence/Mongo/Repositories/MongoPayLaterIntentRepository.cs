using MongoDB.Bson;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Onboarding;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoPayLaterIntentRepository(MongoContext context) : IPayLaterIntentRepository
{
    public async Task<PayLaterIntent?> GetByUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.PayLaterIntents
            .Find(x => x.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task UpsertAsync(PayLaterIntent intent, CancellationToken cancellationToken = default)
    {
        var doc = PayLaterIntentDocument.From(intent);
        await context.PayLaterIntents.ReplaceOneAsync(
            x => x.UserId == intent.UserId,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    public async Task<bool> MarkResolvedAsync(
        UserId userId,
        DateTime resolvedAtUtc,
        CancellationToken cancellationToken = default)
    {
        // First-write-wins: only stamp ResolvedAtUtc when the doc exists AND it is still null.
        // Returning false when there is no intent is intentional — callers can safely invoke
        // this from any payment-completion path without first checking.
        var filter = Builders<PayLaterIntentDocument>.Filter.And(
            Builders<PayLaterIntentDocument>.Filter.Eq(x => x.UserId, userId),
            Builders<PayLaterIntentDocument>.Filter.Eq(x => x.ResolvedAtUtc, null));

        var update = Builders<PayLaterIntentDocument>.Update.Set(x => x.ResolvedAtUtc, resolvedAtUtc);

        var result = await context.PayLaterIntents.UpdateOneAsync(filter, update, cancellationToken: cancellationToken);
        return result.ModifiedCount > 0;
    }

    public async Task<PayLaterStatsSnapshot> GetStatsAsync(
        DateTime nowUtc,
        TimeSpan stalePendingThreshold,
        CancellationToken cancellationToken = default)
    {
        var sevenDaysAgo = nowUtc.AddDays(-7);
        var staleBefore = nowUtc.Subtract(stalePendingThreshold);

        var totalEverTask = context.PayLaterIntents.CountDocumentsAsync(FilterDefinition<PayLaterIntentDocument>.Empty, cancellationToken: cancellationToken);
        var pendingTask = context.PayLaterIntents.CountDocumentsAsync(x => x.ResolvedAtUtc == null, cancellationToken: cancellationToken);
        var resolvedTask = context.PayLaterIntents.CountDocumentsAsync(x => x.ResolvedAtUtc != null, cancellationToken: cancellationToken);
        var resolvedRecentTask = context.PayLaterIntents.CountDocumentsAsync(x => x.ResolvedAtUtc != null && x.ResolvedAtUtc >= sevenDaysAgo, cancellationToken: cancellationToken);
        var createdRecentTask = context.PayLaterIntents.CountDocumentsAsync(x => x.CreatedAtUtc >= sevenDaysAgo, cancellationToken: cancellationToken);
        var staleTask = context.PayLaterIntents.CountDocumentsAsync(x => x.ResolvedAtUtc == null && x.LastSeenAtUtc < staleBefore, cancellationToken: cancellationToken);

        await Task.WhenAll(totalEverTask, pendingTask, resolvedTask, resolvedRecentTask, createdRecentTask, staleTask).ConfigureAwait(false);

        // Avg hours from CreatedAt -> ResolvedAt for resolved rows.
        double? averageHours = null;
        if (resolvedTask.Result > 0)
        {
            var aggregation = await context.PayLaterIntents.Aggregate()
                .Match(x => x.ResolvedAtUtc != null)
                .Group(new BsonDocument
                {
                    { "_id", BsonNull.Value },
                    {
                        "avgMs",
                        new BsonDocument("$avg",
                            new BsonDocument("$subtract", new BsonArray { "$resolvedAtUtc", "$createdAtUtc" }))
                    },
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (aggregation is not null && aggregation.TryGetValue("avgMs", out var ms) && ms.IsNumeric)
            {
                averageHours = ms.ToDouble() / (1000d * 60d * 60d);
            }
        }

        return new PayLaterStatsSnapshot(
            (int)totalEverTask.Result,
            (int)pendingTask.Result,
            (int)resolvedTask.Result,
            (int)resolvedRecentTask.Result,
            (int)createdRecentTask.Result,
            (int)staleTask.Result,
            averageHours);
    }

    public async Task<IReadOnlyList<PayLaterIntentListItem>> ListAsync(
        PayLaterIntentStatusFilter status,
        int skip,
        int take,
        CancellationToken cancellationToken = default)
    {
        var filter = BuildStatusFilter(status);
        var page = await context.PayLaterIntents
            .Find(filter)
            .SortByDescending(x => x.CreatedAtUtc)
            .Skip(skip)
            .Limit(take)
            .ToListAsync(cancellationToken);

        if (page.Count == 0)
        {
            return [];
        }

        var userIds = page.Select(x => x.UserId).Distinct().ToList();
        var users = await context.Users
            .Find(u => userIds.Contains(u.Id))
            .ToListAsync(cancellationToken);
        var usersById = users.ToDictionary(u => u.Id);

        var result = new List<PayLaterIntentListItem>(page.Count);
        foreach (var doc in page)
        {
            if (!usersById.TryGetValue(doc.UserId, out var user))
            {
                // Skip orphaned rows (user deleted via the ops "wipe user" tool, etc.).
                continue;
            }

            result.Add(new PayLaterIntentListItem(
                doc.UserId.Value,
                user.Email,
                string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName,
                user.Phone ?? string.Empty,
                user.DestinationCountry,
                doc.CreatedAtUtc,
                doc.LastSeenAtUtc,
                doc.ResolvedAtUtc,
                doc.PlanAtSignalLabel));
        }

        return result;
    }

    public async Task<int> CountAsync(
        PayLaterIntentStatusFilter status,
        CancellationToken cancellationToken = default)
    {
        var count = await context.PayLaterIntents.CountDocumentsAsync(
            BuildStatusFilter(status),
            cancellationToken: cancellationToken);
        return (int)count;
    }

    private static FilterDefinition<PayLaterIntentDocument> BuildStatusFilter(PayLaterIntentStatusFilter status) =>
        status switch
        {
            PayLaterIntentStatusFilter.Pending => Builders<PayLaterIntentDocument>.Filter.Eq(x => x.ResolvedAtUtc, null),
            PayLaterIntentStatusFilter.Resolved => Builders<PayLaterIntentDocument>.Filter.Ne(x => x.ResolvedAtUtc, null),
            _ => FilterDefinition<PayLaterIntentDocument>.Empty,
        };
}
