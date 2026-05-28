using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

/// <summary>
/// Idempotent customer reminders to upload a purchase invoice after intake.
/// </summary>
internal static class ParcelInvoiceUploadReminder
{
    internal sealed record Result(string Status, string? Detail);

    internal static async Task<Result> SendIfNeededAsync(
        ICustomerWhatsAppMessageLogRepository messageLog,
        IParcelInvoiceRepository invoices,
        IBorderBoxWhatsAppNotifier whatsApp,
        IBorderBoxInAppNotifier inApp,
        User user,
        Parcel parcel,
        CancellationToken cancellationToken,
        bool forceResend = false)
    {
        var parcelId = parcel.Id.Value;
        var correlation = $"parcel-received:{parcelId:D}";

        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken).ConfigureAwait(false);
        if (invoice is not null)
        {
            return new Result("NotNeeded", "Invoice already on file.");
        }

        if (!forceResend)
        {
            var existing = await messageLog
                .GetLatestByCorrelationTagAsync(correlation, cancellationToken)
                .ConfigureAwait(false);
            if (string.Equals(existing?.DeliveryStatus, "Sent", StringComparison.OrdinalIgnoreCase))
            {
                return new Result("AlreadySent", null);
            }
        }

        await whatsApp.NotifyParcelReceivedUploadInvoiceAsync(
            user,
            parcelId,
            parcel.SuiteNumber,
            parcel.ItemName,
            parcel.TrackingNumber,
            cancellationToken).ConfigureAwait(false);

        await inApp.NotifyParcelReceivedUploadInvoiceAsync(
            user,
            parcelId,
            parcel.SuiteNumber,
            parcel.ItemName,
            parcel.TrackingNumber,
            cancellationToken).ConfigureAwait(false);

        var latest = await messageLog
            .GetLatestByCorrelationTagAsync(correlation, cancellationToken)
            .ConfigureAwait(false);
        return MapWhatsAppLog(latest, user);
    }

    private static Result MapWhatsAppLog(CustomerWhatsAppMessageLogEntry? entry, User user)
    {
        if (entry is null)
        {
            if (string.IsNullOrWhiteSpace(user.Phone))
            {
                return new Result("Skipped", "Customer has no phone number on profile.");
            }

            return new Result("Unknown", "Reminder requested but delivery status is unavailable.");
        }

        return entry.DeliveryStatus switch
        {
            "Sent" => new Result("Sent", null),
            "Skipped" => new Result(
                "Skipped",
                string.IsNullOrWhiteSpace(entry.SkipReason)
                    ? "WhatsApp was not sent."
                    : entry.SkipReason),
            "Failed" => new Result(
                "Failed",
                string.IsNullOrWhiteSpace(entry.ErrorMessage)
                    ? entry.ErrorCode ?? "WhatsApp delivery failed."
                    : entry.ErrorMessage),
            _ => new Result(entry.DeliveryStatus, entry.SkipReason),
        };
    }
}
