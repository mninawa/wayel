using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Notifications;

public sealed record MarkCustomerInAppNotificationReadCommand(string NotificationId)
    : ICommand;

public sealed record MarkAllCustomerInAppNotificationsReadCommand
    : ICommand;

internal sealed class MarkCustomerInAppNotificationReadCommandHandler(
    ICurrentUser current,
    ICustomerInAppNotificationRepository notifications)
    : ICommandHandler<MarkCustomerInAppNotificationReadCommand>
{
    public async Task<Result> Handle(
        MarkCustomerInAppNotificationReadCommand command,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        await notifications.MarkReadAsync(current.UserId.Value, command.NotificationId, cancellationToken);
        return Result.Success();
    }
}

internal sealed class MarkAllCustomerInAppNotificationsReadCommandHandler(
    ICurrentUser current,
    ICustomerInAppNotificationRepository notifications)
    : ICommandHandler<MarkAllCustomerInAppNotificationsReadCommand>
{
    public async Task<Result> Handle(
        MarkAllCustomerInAppNotificationsReadCommand command,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        await notifications.MarkAllReadAsync(current.UserId.Value, cancellationToken);
        return Result.Success();
    }
}
