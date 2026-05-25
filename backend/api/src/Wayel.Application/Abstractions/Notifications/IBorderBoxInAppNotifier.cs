using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Persists customer-facing in-app notifications (the bell icon in the
/// portal header) for the same lifecycle events that fan out over
/// <see cref="IBorderBoxWhatsAppNotifier"/>.
///
/// The two notifiers are kept side-by-side so an operator can disable
/// one channel without affecting the other — e.g. WhatsApp can be off
/// in dev while in-app continues to surface receipts, invoice
/// rejections, etc. in the portal.
///
/// Implementations should treat every call as best-effort and never
/// throw: a failure to record an in-app row must not block the parent
/// command (parcel receive, quote completion, etc.).
/// </summary>
public interface IBorderBoxInAppNotifier
{
    /// <summary>
    /// A parcel arrived at the warehouse and the customer needs to
    /// upload a purchase invoice before we can quote freight.
    /// </summary>
    Task NotifyParcelReceivedUploadInvoiceAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Warehouse rejected the invoice the customer uploaded — they need
    /// to upload a replacement or fix the declared value.
    /// </summary>
    Task NotifyInvoiceRejectedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? rejectionReason,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Ops saved an inspection record for the parcel (condition + notes).
    /// </summary>
    Task NotifyInspectionSavedAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string conditionStatus,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Parcel passed warehouse checks and the customer can now request a
    /// shipping quote.
    /// </summary>
    Task NotifyParcelReadyForQuoteAsync(
        User user,
        Guid parcelId,
        string suiteNumber,
        string itemName,
        string? trackingNumber,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Shipping quote has been calculated and is awaiting customer
    /// approval / payment.
    /// </summary>
    Task NotifyQuoteReadyAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal totalZar,
        DateTime validUntilUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Customer's payment for a quote has been confirmed.
    /// </summary>
    Task NotifyQuotePaidAsync(
        User user,
        Guid quoteId,
        string quoteDisplayNumber,
        decimal paidZar,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Shipment has arrived in destination country and is ready for
    /// pickup at the chosen branch.
    /// </summary>
    Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Support ticket was acknowledged — gives the customer a paper
    /// trail in the bell that mirrors the email / WhatsApp ack.
    /// </summary>
    Task NotifySupportTicketOpenedAsync(
        User user,
        string ticketDisplayNumber,
        string subject,
        CancellationToken cancellationToken = default);
}
