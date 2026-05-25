using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Notifications;

public sealed record ListCustomerInAppNotificationsQuery(int Limit = 20)
    : IQuery<CustomerInAppNotificationsResponse>;

public sealed record GetCustomerInAppNotificationUnreadCountQuery
    : IQuery<CustomerInAppNotificationUnreadCountResponse>;

internal sealed class ListCustomerInAppNotificationsQueryHandler(
    ICurrentUser current,
    ICustomerInAppNotificationRepository notifications)
    : IQueryHandler<ListCustomerInAppNotificationsQuery, CustomerInAppNotificationsResponse>
{
    public async Task<Result<CustomerInAppNotificationsResponse>> Handle(
        ListCustomerInAppNotificationsQuery query,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var limit = Math.Clamp(query.Limit, 1, 50);
        var userId = current.UserId.Value;
        var items = await notifications.ListForUserAsync(userId, limit, cancellationToken);
        var unread = await notifications.CountUnreadForUserAsync(userId, cancellationToken);
        return new CustomerInAppNotificationsResponse(
            items.Select(Map).ToList(),
            unread);
    }

    private static CustomerInAppNotificationDto Map(CustomerInAppNotificationRecord record) =>
        new(
            record.Id,
            record.Kind,
            record.Title,
            record.Body,
            record.LinkPath,
            record.CreatedAtUtc,
            record.ReadAtUtc);
}

internal sealed class GetCustomerInAppNotificationUnreadCountQueryHandler(
    ICurrentUser current,
    ICustomerInAppNotificationRepository notifications)
    : IQueryHandler<GetCustomerInAppNotificationUnreadCountQuery, CustomerInAppNotificationUnreadCountResponse>
{
    public async Task<Result<CustomerInAppNotificationUnreadCountResponse>> Handle(
        GetCustomerInAppNotificationUnreadCountQuery query,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var unread = await notifications.CountUnreadForUserAsync(current.UserId.Value, cancellationToken);
        return new CustomerInAppNotificationUnreadCountResponse(unread);
    }
}
