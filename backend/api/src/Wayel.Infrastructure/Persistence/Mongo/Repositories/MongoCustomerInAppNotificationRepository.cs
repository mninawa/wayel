using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoCustomerInAppNotificationRepository(MongoContext context)
    : ICustomerInAppNotificationRepository
{
    public async Task<IReadOnlyList<CustomerInAppNotificationRecord>> ListForUserAsync(
        UserId userId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.CustomerInAppNotifications
            .Find(x => x.UserId == userId)
            .SortByDescending(x => x.CreatedAtUtc)
            .Limit(limit)
            .ToListAsync(cancellationToken);

        return docs.Select(Map).ToList();
    }

    public async Task<int> CountUnreadForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var count = await context.CustomerInAppNotifications.CountDocumentsAsync(
            x => x.UserId == userId && x.ReadAtUtc == null,
            cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task InsertManyAsync(
        IReadOnlyList<CustomerInAppNotificationRecord> notifications,
        CancellationToken cancellationToken = default)
    {
        if (notifications.Count == 0)
        {
            return;
        }

        var docs = notifications.Select(n => new CustomerInAppNotificationDocument
        {
            Id = n.Id,
            UserId = n.UserId,
            Kind = n.Kind,
            Title = n.Title,
            Body = n.Body,
            LinkPath = n.LinkPath,
            CreatedAtUtc = n.CreatedAtUtc,
            ReadAtUtc = n.ReadAtUtc,
        }).ToList();

        await context.CustomerInAppNotifications.InsertManyAsync(docs, cancellationToken: cancellationToken);
    }

    public async Task MarkReadAsync(UserId userId, string notificationId, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        await context.CustomerInAppNotifications.UpdateOneAsync(
            x => x.UserId == userId && x.Id == notificationId && x.ReadAtUtc == null,
            Builders<CustomerInAppNotificationDocument>.Update.Set(x => x.ReadAtUtc, now),
            cancellationToken: cancellationToken);
    }

    public async Task MarkAllReadAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        await context.CustomerInAppNotifications.UpdateManyAsync(
            x => x.UserId == userId && x.ReadAtUtc == null,
            Builders<CustomerInAppNotificationDocument>.Update.Set(x => x.ReadAtUtc, now),
            cancellationToken: cancellationToken);
    }

    private static CustomerInAppNotificationRecord Map(CustomerInAppNotificationDocument doc) =>
        new(
            doc.Id,
            doc.UserId,
            doc.Kind,
            doc.Title,
            doc.Body,
            doc.LinkPath,
            doc.CreatedAtUtc,
            doc.ReadAtUtc);
}
