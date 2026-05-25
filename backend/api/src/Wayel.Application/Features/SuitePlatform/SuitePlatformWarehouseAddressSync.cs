using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Application.Features.SuitePlatform;

public static class SuitePlatformWarehouseAddressSync
{
    public static bool WarehouseAddressChanged(SuitePlatformSettings? before, SuitePlatformSettings after) =>
        before is null ||
        !string.Equals(before.WarehouseName, after.WarehouseName, StringComparison.Ordinal) ||
        !string.Equals(before.AddressLine1, after.AddressLine1, StringComparison.Ordinal) ||
        !string.Equals(before.AddressLine2, after.AddressLine2, StringComparison.Ordinal) ||
        !string.Equals(before.City, after.City, StringComparison.Ordinal) ||
        !string.Equals(before.Province, after.Province, StringComparison.Ordinal) ||
        !string.Equals(before.PostalCode, after.PostalCode, StringComparison.Ordinal);

    public static async Task SyncStoredSuiteAddressesAsync(
        ICustomerAddressRepository addresses,
        SuitePlatformSettings settings,
        CancellationToken cancellationToken)
    {
        var suiteAddresses = await addresses.ListSuiteAddressesForRegionAsync(settings.RegionCode, cancellationToken);
        foreach (var address in suiteAddresses)
        {
            var suiteNumber = address.SuiteNumber ?? string.Empty;
            address.SyncSuiteWarehouse(
                settings.BuildWarehouseLine(suiteNumber),
                settings.City,
                settings.Province,
                settings.PostalCode);
            await addresses.UpdateAsync(address, cancellationToken);
        }
    }

    public static async Task NotifyActiveUsersOfWarehouseAddressChangeAsync(
        ISuiteSubscriptionRepository subscriptions,
        ICustomerInAppNotificationRepository notifications,
        SuitePlatformSettings settings,
        CancellationToken cancellationToken)
    {
        var userIds = await subscriptions.ListActiveSuiteUserIdsByRegionAsync(settings.RegionCode, cancellationToken);
        if (userIds.Count == 0)
        {
            return;
        }

        var regionLabel = SuitePlatformRegions.OriginLabel;
        var title = $"Delivery address ({regionLabel}) updated";
        var body =
            $"We updated your Delivery address ({regionLabel}). Review your suite address before your next order.";
        var now = DateTimeOffset.UtcNow;
        var records = userIds.Select(userId => new CustomerInAppNotificationRecord(
            Guid.NewGuid().ToString("N"),
            userId,
            "suite_address_updated",
            title,
            body,
            "/my-address",
            now,
            null)).ToList();

        await notifications.InsertManyAsync(records, cancellationToken);
    }
}
