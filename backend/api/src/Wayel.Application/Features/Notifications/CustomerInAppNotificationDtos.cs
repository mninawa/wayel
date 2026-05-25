namespace Wayel.Application.Features.Notifications;

public sealed record CustomerInAppNotificationDto(
    string Id,
    string Kind,
    string Title,
    string Body,
    string? LinkPath,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ReadAtUtc);

public sealed record CustomerInAppNotificationsResponse(
    IReadOnlyList<CustomerInAppNotificationDto> Items,
    int UnreadCount);

public sealed record CustomerInAppNotificationUnreadCountResponse(int UnreadCount);
