using Wayel.Application.Features.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Best-effort WhatsApp notifications for WeYell / BorderBox customers via WasenderAPI.
/// Never throws — failures are logged only.
/// </summary>
public interface IBorderBoxWhatsAppNotifier
{
    Task NotifyQuoteReadyAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal totalZar,
        DateTime validUntilUtc,
        CancellationToken cancellationToken = default);

    Task NotifyQuotePaidAsync(
        User user,
        string quoteDisplayNumber,
        decimal paidZar,
        CancellationToken cancellationToken = default);

    Task NotifySupportTicketOpenedAsync(
        User user,
        string ticketDisplayNumber,
        string subject,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Forwards the full ticket to the operations WhatsApp inbox (configured separately
    /// from customer notification preferences).
    /// </summary>
    Task ForwardSupportTicketToInboxAsync(
        User user,
        string? suiteNumber,
        string ticketDisplayNumber,
        string subject,
        string body,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Alerts the operations WhatsApp inbox about a receiving/warehouse exception.
    /// </summary>
    Task NotifySupportInboxOfReceivingExceptionAsync(
        OpsExceptionItemDto exception,
        string exceptionsQueueUrl,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Notifies the suite owner that a parcel was received and they should upload a purchase invoice.
    /// Transactional — sends when the customer has a phone on file (ignores marketing opt-out).
    /// </summary>
    Task NotifyParcelReceivedUploadInvoiceAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Notifies the customer that ops rejected their invoice and they must upload or rectify it.
    /// </summary>
    Task NotifyInvoiceRejectedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? rejectionReason,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends inspection photos and notes to the customer after ops saves an inspection.
    /// </summary>
    Task NotifyInspectionSavedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string conditionStatus,
        string? inspectionNotes,
        IReadOnlyList<string> imageUrls,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Notifies the customer that their parcel passed warehouse checks and they should request a shipping quote.
    /// </summary>
    Task NotifyParcelReadyForQuoteAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default);

    Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default);
}
