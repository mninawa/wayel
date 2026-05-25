using System.Globalization;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Default implementation of <see cref="IBorderBoxInAppNotifier"/> that
/// persists rows into <see cref="ICustomerInAppNotificationRepository"/>
/// so they appear in the customer-portal bell.
///
/// Every method is best-effort: a Mongo write failure is logged and
/// swallowed so it never breaks the parent command. This mirrors the
/// failure semantics of the WhatsApp notifier.
/// </summary>
internal sealed class BorderBoxInAppNotifier(
    ICustomerInAppNotificationRepository notifications,
    IClock clock,
    ILogger<BorderBoxInAppNotifier> logger) : IBorderBoxInAppNotifier
{
    public Task NotifyParcelReceivedUploadInvoiceAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default)
    {
        var trackingLine = string.IsNullOrWhiteSpace(trackingNumber)
            ? string.Empty
            : $" · tracking {trackingNumber.Trim()}";
        return InsertAsync(
            user.Id,
            kind: "parcel_received",
            title: "Parcel received — upload invoice",
            body: $"{itemName.Trim()} (suite {suiteNumber.Trim()}{trackingLine}) "
                  + "arrived at our warehouse. Upload the purchase invoice so we can quote freight.",
            linkPath: $"/parcels/{parcelId:D}",
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
        var reason = string.IsNullOrWhiteSpace(rejectionReason)
            ? "Please review your invoice and declared value."
            : rejectionReason.Trim();
        return InsertAsync(
            user.Id,
            kind: "invoice_rejected",
            title: "Invoice needs attention",
            body: $"We could not accept the invoice for {itemName.Trim()} "
                  + $"(suite {suiteNumber.Trim()}). {Truncate(reason, 280)}",
            linkPath: $"/parcels/{parcelId:D}",
            cancellationToken);
    }

    public Task NotifyInspectionSavedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string conditionStatus,
        CancellationToken cancellationToken = default)
    {
        return InsertAsync(
            user.Id,
            kind: "parcel_inspected",
            title: "Parcel inspection complete",
            body: $"{itemName.Trim()} (suite {suiteNumber.Trim()}) was inspected — "
                  + $"condition recorded as {conditionStatus.Trim()}.",
            linkPath: $"/parcels/{parcelId:D}",
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
        var trackingLine = string.IsNullOrWhiteSpace(trackingNumber)
            ? string.Empty
            : $" · tracking {trackingNumber.Trim()}";
        return InsertAsync(
            user.Id,
            kind: "parcel_ready_for_quote",
            title: "Ready for shipping quote",
            body: $"{itemName.Trim()} (suite {suiteNumber.Trim()}{trackingLine}) "
                  + "passed warehouse checks. Request a shipping quote to continue.",
            linkPath: "/quotes/request",
            cancellationToken);
    }

    public Task NotifyQuoteReadyAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal totalZar,
        DateTime validUntilUtc,
        CancellationToken cancellationToken = default)
    {
        var validLocal = validUntilUtc.ToString("d MMM yyyy HH:mm 'UTC'", CultureInfo.InvariantCulture);
        return InsertAsync(
            user.Id,
            kind: "quote_ready",
            title: $"Quote {quoteDisplayNumber} is ready",
            body: $"Total: R {totalZar.ToString("N2", CultureInfo.InvariantCulture)}. "
                  + $"Valid until {validLocal}. Review and approve to continue with payment.",
            linkPath: $"/quotes/{quoteId:D}",
            cancellationToken);
    }

    public Task NotifyQuotePaidAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal paidZar,
        CancellationToken cancellationToken = default)
    {
        return InsertAsync(
            user.Id,
            kind: "quote_paid",
            title: $"Payment received — {quoteDisplayNumber}",
            body: $"We confirmed R {paidZar.ToString("N2", CultureInfo.InvariantCulture)} "
                  + "for your shipment. Your parcel is being prepared for export.",
            linkPath: $"/quotes/{quoteId:D}",
            cancellationToken);
    }

    public Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default)
    {
        return InsertAsync(
            user.Id,
            kind: "ready_for_collection",
            title: "Ready for collection",
            body: $"Shipment {shipmentDisplayId.Trim()} has arrived at {hubName.Trim()}, "
                  + $"{hubCity.Trim()}. Bring your National ID or Passport when collecting.",
            linkPath: "/shipments",
            cancellationToken);
    }

    public Task NotifySupportTicketOpenedAsync(
        User user,
        string ticketDisplayNumber,
        string subject,
        CancellationToken cancellationToken = default)
    {
        return InsertAsync(
            user.Id,
            kind: "support_ticket_opened",
            title: $"Support ticket {ticketDisplayNumber} received",
            body: $"Subject: {Truncate(subject.Trim(), 180)}. Our team will respond from the portal.",
            linkPath: "/support",
            cancellationToken);
    }

    private async Task InsertAsync(
        UserId userId,
        string kind,
        string title,
        string body,
        string? linkPath,
        CancellationToken cancellationToken)
    {
        try
        {
            var record = new CustomerInAppNotificationRecord(
                Id: Guid.NewGuid().ToString("N"),
                UserId: userId,
                Kind: kind,
                Title: title,
                Body: body,
                LinkPath: linkPath,
                CreatedAtUtc: clock.UtcNow,
                ReadAtUtc: null);

            await notifications.InsertManyAsync(new[] { record }, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Failed to persist in-app notification kind={Kind} for user {UserId}.",
                kind,
                userId);
        }
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..(max - 1)] + "…";
}
