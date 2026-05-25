using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

internal static class OpsQuoteQueuePromoter
{
    internal static async Task<bool> TryPromoteAsync(
        Parcel parcel,
        ParcelInvoice? invoice,
        ParcelOpsMetadata? meta,
        IParcelRepository parcels,
        IParcelOpsActivityRepository activities,
        IUserRepository users,
        IBorderBoxWhatsAppNotifier whatsApp,
        IBorderBoxInAppNotifier inApp,
        IClock clock,
        string actor,
        CancellationToken cancellationToken)
    {
        var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
        if (readiness.State != "READY")
        {
            return false;
        }

        parcel.MarkReadyToShip();
        await parcels.UpdateAsync(parcel, cancellationToken);
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcel.Id,
            "QUOTE_QUEUED",
            "Sent to quote queue",
            "Automated handoff — customer notified to request a quote.",
            actor,
            clock.UtcNow,
            cancellationToken);

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        if (user is not null)
        {
            await whatsApp.NotifyParcelReadyForQuoteAsync(
                user,
                parcel.Id.Value,
                parcel.SuiteNumber,
                parcel.ItemName,
                parcel.TrackingNumber,
                cancellationToken);

            await inApp.NotifyParcelReadyForQuoteAsync(
                user,
                parcel.Id.Value,
                parcel.SuiteNumber,
                parcel.ItemName,
                parcel.TrackingNumber,
                cancellationToken);
        }

        return true;
    }
}
