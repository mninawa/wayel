using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Collection;
using Wayel.Domain.PickupBranches;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Collection;

public sealed record CollectionHubInfo(string HubId, string HubName, string HubCity);

internal static class CollectionHubResolver
{
    public static async Task<CollectionHubInfo> ResolveAsync(
        UserId userId,
        ICustomerAddressRepository addresses,
        IPickupBranchRepository pickupBranches,
        CancellationToken cancellationToken)
    {
        var all = await addresses.ListForUserAsync(userId, cancellationToken);
        var delivery = all.FirstOrDefault(a => a.IsDefault && !a.IsSuiteAddress)
            ?? all.FirstOrDefault(a => !a.IsSuiteAddress);

        if (delivery is not null && !string.IsNullOrWhiteSpace(delivery.PickupBranchId))
        {
            var branch = await pickupBranches.GetByIdAsync(delivery.PickupBranchId, cancellationToken);
            if (branch is not null)
            {
                return new CollectionHubInfo(branch.Id, branch.Name, branch.City);
            }
        }

        var branches = await pickupBranches.ListActiveAsync(cancellationToken);
        PickupBranch? fallback = null;
        foreach (var branch in branches)
        {
            if (branch.City.Contains("Mbabane", StringComparison.OrdinalIgnoreCase))
            {
                fallback = branch;
                break;
            }
        }

        fallback ??= branches.Count > 0 ? branches[0] : null;
        if (fallback is null)
        {
            return new CollectionHubInfo("mbabane-plaza", "Mbabane Plaza", "Mbabane");
        }

        return new CollectionHubInfo(fallback.Id, fallback.Name, fallback.City);
    }
}

internal static class ShipmentCollectionProvisioner
{
    public static async Task<ShipmentCollectionRecord?> EnsureInTransitAsync(
        Guid shipmentId,
        IShipmentRepository shipments,
        IPickTaskRepository pickTasks,
        IPackingTaskRepository packingTasks,
        IUserRepository users,
        ICustomerAddressRepository addresses,
        IPickupBranchRepository pickupBranches,
        IShipmentCollectionRepository collections,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var existing = await collections.GetByShipmentIdAsync(shipmentId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var shipment = await shipments.GetByIdAsync(new ShipmentId(shipmentId), cancellationToken);
        if (shipment is null || shipment.Status is not (ShipmentStatus.InTransit or ShipmentStatus.Delivered))
        {
            return null;
        }

        var packing = await packingTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
        if (packing is null
            || !string.Equals(
                packing.DispatchStagingStatus,
                DispatchStagingStatuses.Dispatched,
                StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var pick = await pickTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
        var user = await users.GetByIdAsync(shipment.UserId, cancellationToken);
        var hub = await CollectionHubResolver.ResolveAsync(
            shipment.UserId,
            addresses,
            pickupBranches,
            cancellationToken);
        var now = clock.UtcNow;

        var record = new ShipmentCollectionRecord(
            shipmentId,
            shipment.UserId.Value,
            packing.ShipmentDisplayId,
            shipment.Status == ShipmentStatus.Delivered
                ? ShipmentCollectionStatuses.Collected
                : ShipmentCollectionStatuses.InTransit,
            hub.HubId,
            hub.HubName,
            hub.HubCity,
            user?.DisplayName ?? pick?.CustomerDisplayName ?? "Customer",
            pick?.SuiteNumber,
            pick?.Parcels.Count ?? shipment.ParcelIds.Count,
            now,
            ReadyForCollectionAtUtc: null,
            NotificationSentAtUtc: null,
            CollectedAtUtc: shipment.Status == ShipmentStatus.Delivered ? now : null,
            CollectorIdType: null,
            CollectorIdNumber: null,
            CollectorName: null,
            RecordedByOpsUserId: null,
            UpdatedAtUtc: now);

        await collections.UpsertAsync(record, cancellationToken);
        return record;
    }
}
