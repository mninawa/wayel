using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Configuration;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Notifications;

internal sealed class BorderBoxEmailNotifier(
    IEmailTransport emailTransport,
    IOptions<BorderBoxOptions> borderBoxOptions,
    IOptions<NotificationEmailOptions> emailOptions,
    ILogger<BorderBoxEmailNotifier> logger) : IBorderBoxEmailNotifier
{
    public async Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default)
    {
        if (!user.NotifyEmail)
        {
            logger.LogInformation(
                "Skipping email ready-for-collection:{ShipmentId} — customer opted out.",
                shipmentId);
            return;
        }

        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var from = emailOptions.Value.FromAddress ?? "notifications@weyell.app";
        var fromName = emailOptions.Value.FromDisplayName ?? "WeYell";
        var subject = $"Ready for collection — {shipmentDisplayId.Trim()}";
        var body =
            $"Hello {user.DisplayName},\n\n"
            + "Your parcel has arrived in Eswatini and is ready for collection.\n\n"
            + $"Shipment: {shipmentDisplayId.Trim()}\n"
            + $"Pickup location: {hubName.Trim()}, {hubCity.Trim()}\n\n"
            + "Please bring your National ID or Passport when collecting your order.\n\n"
            + $"Track your shipment: {portalBase}/shipments\n\n"
            + "— WeYell";

        await emailTransport.SendAsync(
            new EmailMessage(
                from,
                fromName,
                user.Email.Value,
                subject,
                body,
                HtmlBody: $"<pre>{body}</pre>",
                CorrelationTag: $"ready-for-collection:{shipmentId:D}"),
            cancellationToken).ConfigureAwait(false);
    }
}
