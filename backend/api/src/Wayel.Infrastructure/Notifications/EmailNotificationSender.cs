using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Notifications;

namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Production implementation of <see cref="INotificationSender"/> that
/// renders simple text templates and dispatches via the configured
/// <see cref="IEmailTransport"/>. Best-effort: transport failures are
/// logged at WARN level and never re-thrown.
/// </summary>
internal sealed class EmailNotificationSender(
    IEmailTransport emailTransport,
    IOptions<NotificationEmailOptions> emailOptions,
    ILogger<EmailNotificationSender> logger) : INotificationSender
{
    private NotificationEmailOptions Email => emailOptions.Value;

    public Task SendInvitationAsync(
        InvitationNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"You're invited to {notification.InstitutionName} on Wayel";
        var body = $"""
            Hi,

            You've been invited to join {notification.InstitutionName} on Wayel as {notification.Role}.

            Accept the invitation: {ResolveAcceptUrl(notification.AcceptUrl, notification.PlaintextToken)}

            This invitation expires on {notification.ExpiresOnUtc:dd MMM yyyy}.

            — Wayel
            """;
        return SendAsync(
            notification.RecipientEmail,
            subject,
            body,
            $"invitation:{notification.InvitationId:D}",
            cancellationToken);
    }

    public Task SendSubscriptionDecisionAsync(
        SubscriptionDecisionNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = notification.Approved
            ? $"Your subscription request at {notification.InstitutionName} was approved"
            : $"Your subscription request at {notification.InstitutionName} was declined";
        var body = notification.Approved
            ? $"""
                Hi,

                Great news — your enrolment request for {notification.ChildDisplayName} at
                {notification.InstitutionName} has been approved.

                {(string.IsNullOrWhiteSpace(notification.FormattedTotal) ? string.Empty : $"Amount: {notification.FormattedTotal}\n")}
                — Wayel
                """
            : $"""
                Hi,

                Your enrolment request for {notification.ChildDisplayName} at
                {notification.InstitutionName} was declined.

                {(string.IsNullOrWhiteSpace(notification.RejectionReason) ? string.Empty : $"Reason: {notification.RejectionReason}\n")}
                — Wayel
                """;
        return SendAsync(
            notification.ParentEmail,
            subject,
            body,
            $"sub-decision:{notification.SubscriptionRequestId:D}",
            cancellationToken);
    }

    public Task SendInvitationAcceptedAsync(
        InvitationAcceptedNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"{notification.AcceptedByDisplayName} accepted your invitation";
        var body = $"""
            Hi,

            {notification.AcceptedByDisplayName} ({notification.AcceptedByEmail}) just accepted your
            invitation to {notification.InstitutionName} as {notification.Role}.

            — Wayel
            """;
        return SendAsync(
            notification.InviterEmail,
            subject,
            body,
            $"invitation-accepted:{notification.InvitationId:D}",
            cancellationToken);
    }

    public Task SendCoParentInvitationAsync(
        CoParentInvitationNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"{notification.InviterDisplayName} invited you to {notification.HouseholdLabel}";
        var body = $"""
            Hi,

            {notification.InviterDisplayName} has invited you to share their household
            {notification.HouseholdLabel} on Wayel.

            Accept the invitation: {ResolveAcceptUrl(notification.AcceptUrl, notification.PlaintextToken)}

            This invitation expires on {notification.ExpiresOnUtc:dd MMM yyyy}.

            — Wayel
            """;
        return SendAsync(
            notification.RecipientEmail,
            subject,
            body,
            $"co-parent-invite:{notification.InvitationId:D}",
            cancellationToken);
    }

    public Task SendSubscriptionChargeFailedAsync(
        SubscriptionChargeFailedNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Payment failed for {notification.InstitutionName}";
        var body = $"""
            Hi,

            We weren't able to charge your saved card for {notification.InstitutionName}
            ({notification.FormattedAmount}).

            {(string.IsNullOrWhiteSpace(notification.FailureReason) ? string.Empty : $"Reason: {notification.FailureReason}\n")}
            Please update your card details to avoid interruption.

            — Wayel
            """;
        return SendAsync(
            notification.ParentEmail,
            subject,
            body,
            $"charge-failed:{notification.PaymentId:D}",
            cancellationToken);
    }

    public Task SendSubscriptionChargeSucceededAsync(
        SubscriptionChargeSucceededNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Receipt — {notification.InstitutionName}";
        var body = $"""
            Hi,

            We've received your payment of {notification.FormattedAmount} for
            {notification.InstitutionName}.

            {(string.IsNullOrWhiteSpace(notification.InvoiceNumber) ? string.Empty : $"Invoice: {notification.InvoiceNumber}\n")}
            — Wayel
            """;
        return SendAsync(
            notification.ParentEmail,
            subject,
            body,
            $"charge-success:{notification.PaymentId:D}",
            cancellationToken);
    }

    public Task SendInvoiceEmailAsync(
        InvoiceEmailNotification notification,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Your invoice {notification.InvoiceNumber} from {notification.InstitutionName}";
        var body = $"""
            Hi {notification.ParentDisplayName},

            Your invoice for {notification.ChildDisplayName} at {notification.InstitutionName} is ready.

            Invoice: {notification.InvoiceNumber}
            Status: {notification.Status}
            Total: {notification.FormattedTotal}
            Due: {notification.DueOnUtc:dd MMM yyyy}

            — Wayel
            """;
        return SendAsync(
            notification.ParentEmail,
            subject,
            body,
            $"invoice:{notification.InvoiceId:D}",
            cancellationToken);
    }

    private async Task SendAsync(
        string toAddress,
        string subject,
        string body,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(toAddress))
        {
            logger.LogDebug("Skipping notification {Tag}: recipient address is empty.", correlationTag);
            return;
        }

        if (!Email.Enabled)
        {
            logger.LogDebug("Email notifications disabled — skipping {Tag}.", correlationTag);
            return;
        }

        var from = string.IsNullOrWhiteSpace(Email.FromAddress)
            ? "notifications@weyell.app"
            : Email.FromAddress!;

        try
        {
            await emailTransport.SendAsync(
                new EmailMessage(
                    from,
                    Email.FromDisplayName ?? "Wayel",
                    toAddress.Trim(),
                    subject,
                    body,
                    HtmlBody: $"<pre>{System.Net.WebUtility.HtmlEncode(body)}</pre>",
                    CorrelationTag: correlationTag),
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deliver notification {Tag} via {Provider}.",
                correlationTag,
                emailTransport.ProviderName);
        }
    }

    private static string ResolveAcceptUrl(string? baseUrl, string token)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return $"https://app.weyell.com/invitations/accept?token={Uri.EscapeDataString(token)}";
        }

        var separator = baseUrl.Contains('?') ? '&' : '?';
        return $"{baseUrl}{separator}token={Uri.EscapeDataString(token)}";
    }
}
