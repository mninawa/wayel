using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Tracking;
using Wayel.Domain.Collection;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Collection;

internal static class CollectionStatusTransitions
{
    public static async Task<(ShipmentCollectionRecord Record, bool NotificationSent)> MarkReadyForCollectionAsync(
        ShipmentCollectionRecord record,
        string? hubCity,
        IShipmentRepository shipments,
        IPickupBranchRepository pickupBranches,
        IUserRepository users,
        IBorderBoxWhatsAppNotifier whatsApp,
        IBorderBoxEmailNotifier email,
        IBorderBoxInAppNotifier inApp,
        ShipmentTrackingEventWriter trackingEvents,
        IClock clock,
        IShipmentCollectionRepository collections,
        CancellationToken cancellationToken)
    {
        if (record.Status == ShipmentCollectionStatuses.Collected)
        {
            throw new InvalidOperationException("Shipment already collected.");
        }

        if (record.Status == ShipmentCollectionStatuses.ReadyForCollection)
        {
            return (record, record.NotificationSentAtUtc is not null);
        }

        var now = clock.UtcNow;
        var updated = record with
        {
            Status = ShipmentCollectionStatuses.ReadyForCollection,
            ReadyForCollectionAtUtc = now,
            UpdatedAtUtc = now,
        };

        if (!string.IsNullOrWhiteSpace(hubCity)
            && !string.Equals(updated.HubCity, hubCity, StringComparison.OrdinalIgnoreCase))
        {
            var branches = await pickupBranches.ListActiveAsync(cancellationToken);
            var branch = branches.FirstOrDefault(b =>
                string.Equals(b.City, hubCity, StringComparison.OrdinalIgnoreCase));
            if (branch is not null)
            {
                updated = updated with
                {
                    HubId = branch.Id,
                    HubName = branch.Name,
                    HubCity = branch.City,
                };
            }
        }

        await collections.UpsertAsync(updated, cancellationToken);

        var shipment = await shipments.GetByIdAsync(new ShipmentId(record.ShipmentId), cancellationToken);
        if (shipment is not null)
        {
            var location = $"{updated.HubCity}, Eswatini";
            await trackingEvents.RecordReadyForCollectionAsync(
                shipment,
                location,
                $"Available for pickup at {updated.HubName}",
                cancellationToken);
        }

        var notificationSent = false;
        var user = await users.GetByIdAsync(new UserId(record.UserId), cancellationToken);
        if (user is not null)
        {
            await whatsApp.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            await email.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            await inApp.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            notificationSent = true;
            updated = updated with { NotificationSentAtUtc = now };
            await collections.UpsertAsync(updated, cancellationToken);
        }

        return (updated, notificationSent);
    }

    public static async Task<ShipmentCollectionRecord> RevertToInTransitAsync(
        ShipmentCollectionRecord record,
        IClock clock,
        IShipmentCollectionRepository collections,
        CancellationToken cancellationToken)
    {
        if (record.Status != ShipmentCollectionStatuses.ReadyForCollection)
        {
            return record;
        }

        var now = clock.UtcNow;
        var updated = record with
        {
            Status = ShipmentCollectionStatuses.InTransit,
            ReadyForCollectionAtUtc = null,
            UpdatedAtUtc = now,
        };
        await collections.UpsertAsync(updated, cancellationToken);
        return updated;
    }
}
