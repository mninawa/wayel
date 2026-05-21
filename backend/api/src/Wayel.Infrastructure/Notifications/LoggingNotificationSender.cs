using Wayel.Application.Abstractions.Notifications;

namespace Wayel.Infrastructure.Notifications;

/// <summary>Phase 1 stub — logs notification calls without sending.</summary>
internal sealed class LoggingNotificationSender : INotificationSender
{
    public Task SendInvitationAsync(InvitationNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendSubscriptionDecisionAsync(SubscriptionDecisionNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendInvitationAcceptedAsync(InvitationAcceptedNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendCoParentInvitationAsync(CoParentInvitationNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendSubscriptionChargeFailedAsync(SubscriptionChargeFailedNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendSubscriptionChargeSucceededAsync(SubscriptionChargeSucceededNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task SendInvoiceEmailAsync(InvoiceEmailNotification notification, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
