using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record CustomerInAppNotificationRecord(
    string Id,
    UserId UserId,
    string Kind,
    string Title,
    string Body,
    string? LinkPath,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReadAtUtc);

public interface ICustomerInAppNotificationRepository
{
    Task<IReadOnlyList<CustomerInAppNotificationRecord>> ListForUserAsync(
        UserId userId,
        int limit,
        CancellationToken cancellationToken = default);

    Task<int> CountUnreadForUserAsync(UserId userId, CancellationToken cancellationToken = default);

    Task InsertManyAsync(
        IReadOnlyList<CustomerInAppNotificationRecord> notifications,
        CancellationToken cancellationToken = default);

    Task MarkReadAsync(UserId userId, string notificationId, CancellationToken cancellationToken = default);

    Task MarkAllReadAsync(UserId userId, CancellationToken cancellationToken = default);
}
