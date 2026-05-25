using System.Globalization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Notifications;

internal sealed class BorderBoxWhatsAppNotifier(
    IWhatsAppSender whatsApp,
    IOptions<NotificationWaSenderOptions> options,
    IOptions<BorderBoxOptions> borderBoxOptions,
    ILogger<BorderBoxWhatsAppNotifier> logger) : IBorderBoxWhatsAppNotifier
{
    public Task NotifyQuoteReadyAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal totalZar,
        DateTime validUntilUtc,
        CancellationToken cancellationToken = default)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var quoteUrl = $"{portalBase}/quotes/{quoteId:D}";
        var validLocal = validUntilUtc.ToString("d MMM yyyy HH:mm 'UTC'", CultureInfo.InvariantCulture);
        var body =
            $"Good news — your shipping quote {quoteDisplayNumber} is ready to review.\n\n"
            + $"Total to pay: R {totalZar:N2}\n"
            + $"Valid until: {validLocal}\n\n"
            + "Next step: sign in to WeYell and approve your quote to continue with payment.\n\n"
            + quoteUrl;
        return SendToCustomerIfOptedInAsync(user, body, $"quote-ready:{quoteDisplayNumber}", cancellationToken);
    }

    public Task NotifyQuotePaidAsync(
        User user,
        string quoteDisplayNumber,
        decimal paidZar,
        CancellationToken cancellationToken = default)
    {
        var body =
            $"Payment received for quote {quoteDisplayNumber} — R {paidZar:N2}.\n\n"
            + "Your shipment is being prepared. Track progress in the WeYell portal.";
        return SendToCustomerIfOptedInAsync(user, body, $"quote-paid:{quoteDisplayNumber}", cancellationToken);
    }

    public Task NotifySupportTicketOpenedAsync(
        User user,
        string ticketDisplayNumber,
        string subject,
        CancellationToken cancellationToken = default)
    {
        var body =
            $"We received your support request {ticketDisplayNumber}.\n\n"
            + $"Subject: {subject}\n\n"
            + "Our team will respond in the WeYell portal.";
        return SendToCustomerIfOptedInAsync(user, body, $"support-ack:{ticketDisplayNumber}", cancellationToken);
    }

    public Task NotifyParcelReceivedUploadInvoiceAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var parcelUrl = $"{portalBase}/parcels/{parcelId:D}";
        var trackingLine = string.IsNullOrWhiteSpace(trackingNumber)
            ? "Tracking: (not on label)"
            : $"Tracking: {trackingNumber.Trim()}";

        var body =
            "Your parcel has arrived at our warehouse.\n\n"
            + $"Item: {itemName.Trim()}\n"
            + $"Suite: {suiteNumber.Trim()}\n"
            + $"{trackingLine}\n\n"
            + "Please sign in to WeYell and upload your purchase invoice (PDF or photo) "
            + "so we can prepare your shipping quote.\n\n"
            + parcelUrl;

        return SendTransactionalToCustomerIfHasPhoneAsync(
            user,
            body,
            $"parcel-received:{parcelId:D}",
            cancellationToken);
    }

    public Task NotifyParcelReadyForQuoteAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var quoteUrl = $"{portalBase}/quotes/request";
        var trackingLine = string.IsNullOrWhiteSpace(trackingNumber)
            ? "Tracking: (not on label)"
            : $"Tracking: {trackingNumber.Trim()}";

        var body =
            "Your parcel passed warehouse checks and is ready for a shipping quote.\n\n"
            + $"Item: {itemName.Trim()}\n"
            + $"Suite: {suiteNumber.Trim()}\n"
            + $"{trackingLine}\n\n"
            + "Next step: sign in to WeYell and request a quote. "
            + "We'll calculate your landed cost including freight, duties and handling.\n\n"
            + quoteUrl;

        return SendToCustomerIfOptedInAsync(
            user,
            body,
            $"parcel-ready-for-quote:{parcelId:D}",
            cancellationToken);
    }

    public Task NotifyInvoiceRejectedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? rejectionReason,
        CancellationToken cancellationToken = default)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var parcelUrl = $"{portalBase}/parcels/{parcelId:D}";
        var reason = string.IsNullOrWhiteSpace(rejectionReason)
            ? "Please review your invoice and declared value."
            : rejectionReason.Trim();
        if (reason.Length > 500)
        {
            reason = reason[..497] + "…";
        }

        var body =
            "Your purchase invoice was rejected by our warehouse team.\n\n"
            + $"Item: {itemName.Trim()}\n"
            + $"Suite: {suiteNumber.Trim()}\n\n"
            + $"Reason: {reason}\n\n"
            + "Please sign in to WeYell and upload a corrected invoice (PDF or photo), "
            + "or update the declared value so it matches your document.\n\n"
            + parcelUrl;

        return SendToCustomerIfOptedInAsync(
            user,
            body,
            $"invoice-rejected:{parcelId:D}",
            cancellationToken);
    }

    public async Task NotifyInspectionSavedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string conditionStatus,
        string? inspectionNotes,
        IReadOnlyList<string> imageUrls,
        CancellationToken cancellationToken = default)
    {
        if (!user.NotifyWhatsApp || string.IsNullOrWhiteSpace(user.Phone))
        {
            return;
        }

        var body = BuildInspectionMessageBody(
            parcelId,
            suiteNumber,
            itemName,
            conditionStatus,
            inspectionNotes);

        if (imageUrls.Count == 0)
        {
            await SendToCustomerIfOptedInAsync(
                user,
                body,
                $"inspection-saved:{parcelId:D}",
                cancellationToken).ConfigureAwait(false);
            return;
        }

        await SendImageToCustomerIfOptedInAsync(
            user,
            imageUrls[0],
            body,
            $"inspection-saved:{parcelId:D}:1",
            cancellationToken).ConfigureAwait(false);

        for (var i = 1; i < imageUrls.Count; i++)
        {
            await SendImageToCustomerIfOptedInAsync(
                user,
                imageUrls[i],
                caption: null,
                $"inspection-saved:{parcelId:D}:{i + 1}",
                cancellationToken).ConfigureAwait(false);
        }
    }

    private string BuildInspectionMessageBody(
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string conditionStatus,
        string? inspectionNotes)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var parcelUrl = $"{portalBase}/parcels/{parcelId:D}";
        var notes = string.IsNullOrWhiteSpace(inspectionNotes)
            ? "No additional notes from the warehouse team."
            : inspectionNotes.Trim();
        if (notes.Length > 900)
        {
            notes = notes[..897] + "…";
        }

        return string.Join(
            '\n',
            new[]
            {
                "Your parcel has been inspected at our warehouse.",
                string.Empty,
                $"Item: {itemName.Trim()}",
                $"Suite: {suiteNumber.Trim()}",
                $"Condition: {conditionStatus.Trim()}",
                string.Empty,
                notes,
                string.Empty,
                parcelUrl,
            });
    }

    private async Task SendImageToCustomerIfOptedInAsync(
        User user,
        string imageUrl,
        string? caption,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        if (!user.NotifyWhatsApp || string.IsNullOrWhiteSpace(user.Phone))
        {
            return;
        }

        await SendImageToPhoneAsync(user.Phone, imageUrl, caption, correlationTag, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task SendImageToPhoneAsync(
        string rawPhone,
        string imageUrl,
        string? caption,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        var to = WhatsAppPhoneNormalizer.ToE164(rawPhone);
        if (to is null)
        {
            logger.LogWarning(
                "Skipping WhatsApp image {Correlation} — invalid phone {Phone}.",
                correlationTag,
                rawPhone);
            return;
        }

        var result = await whatsApp.SendImageAsync(
            new WhatsAppImageMessage(to, imageUrl, caption, correlationTag, BypassAllowlist: true),
            cancellationToken).ConfigureAwait(false);

        if (!result.IsSuccess)
        {
            logger.LogWarning(
                "WhatsApp image {Correlation} to {Phone} failed: {Code} {Message}",
                correlationTag,
                to,
                result.ErrorCode,
                result.ErrorMessage);
        }
    }

    public Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default)
    {
        var portalBase = borderBoxOptions.Value.CustomerPortalBaseUrl.Trim().TrimEnd('/');
        var trackingUrl = $"{portalBase}/shipments";
        var body =
            "Your parcel has arrived in Eswatini and is ready for collection.\n\n"
            + $"Shipment: {shipmentDisplayId.Trim()}\n"
            + $"Pickup location: {hubName.Trim()}, {hubCity.Trim()}\n\n"
            + "Please bring your National ID or Passport when collecting your order.\n\n"
            + trackingUrl;
        return SendToCustomerIfOptedInAsync(
            user,
            body,
            $"ready-for-collection:{shipmentId:D}",
            cancellationToken);
    }

    public Task ForwardSupportTicketToInboxAsync(
        User user,
        string? suiteNumber,
        string ticketDisplayNumber,
        string subject,
        string body,
        CancellationToken cancellationToken = default)
    {
        var cfg = options.Value;
        if (!cfg.Enabled || string.IsNullOrWhiteSpace(cfg.SupportInboxPhoneE164))
        {
            return Task.CompletedTask;
        }

        var message = BuildSupportInboxMessage(user, suiteNumber, ticketDisplayNumber, subject, body);
        return SendToPhoneAsync(
            cfg.SupportInboxPhoneE164,
            message,
            $"support-inbox:{ticketDisplayNumber}",
            cancellationToken);
    }

    private static string BuildSupportInboxMessage(
        User user,
        string? suiteNumber,
        string ticketDisplayNumber,
        string subject,
        string body)
    {
        var phone = string.IsNullOrWhiteSpace(user.Phone) ? "—" : user.Phone.Trim();
        var suite = string.IsNullOrWhiteSpace(suiteNumber) ? "—" : suiteNumber.Trim();
        var trimmedBody = body.Trim();
        if (trimmedBody.Length > 1200)
        {
            trimmedBody = trimmedBody[..1197] + "…";
        }

        return string.Join(
            '\n',
            new[]
            {
                $"New support ticket {ticketDisplayNumber}",
                string.Empty,
                $"Customer: {user.DisplayName}",
                $"Email: {user.Email.Value}",
                $"Phone: {phone}",
                $"Suite: {suite}",
                string.Empty,
                $"Subject: {subject.Trim()}",
                string.Empty,
                "Message:",
                trimmedBody,
            });
    }

    private async Task SendTransactionalToCustomerIfHasPhoneAsync(
        User user,
        string body,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(user.Phone))
        {
            logger.LogInformation(
                "Skipping WhatsApp {Correlation} — customer has no phone on profile.",
                correlationTag);
            return;
        }

        await SendToPhoneAsync(user.Phone, body, correlationTag, cancellationToken).ConfigureAwait(false);
    }

    private async Task SendToCustomerIfOptedInAsync(
        User user,
        string body,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        if (!user.NotifyWhatsApp || string.IsNullOrWhiteSpace(user.Phone))
        {
            logger.LogInformation(
                "Skipping WhatsApp {Correlation} — customer opted out or has no phone.",
                correlationTag);
            return;
        }

        await SendToPhoneAsync(user.Phone, body, correlationTag, cancellationToken).ConfigureAwait(false);
    }

    private async Task SendToPhoneAsync(
        string rawPhone,
        string body,
        string correlationTag,
        CancellationToken cancellationToken)
    {
        var to = WhatsAppPhoneNormalizer.ToE164(rawPhone);
        if (to is null)
        {
            logger.LogWarning(
                "Skipping WhatsApp {Correlation} — invalid phone {Phone}.",
                correlationTag,
                rawPhone);
            return;
        }

        var result = await whatsApp.SendTextAsync(
            new WhatsAppTextMessage(to, body, correlationTag, BypassAllowlist: true),
            cancellationToken).ConfigureAwait(false);

        if (!result.IsSuccess)
        {
            logger.LogWarning(
                "WhatsApp {Correlation} to {Phone} failed: {Code} {Message}",
                correlationTag,
                to,
                result.ErrorCode,
                result.ErrorMessage);
        }
    }
}
