using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Applies a suite-number change across every customer-owned surface that
/// caches the value (subscription, address, parcels, pick tasks, collection board).
/// </summary>
internal sealed class CustomerSuiteNumberChanger(
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuiteNumberPoolRepository pool,
    IParcelRepository parcels,
    IShipmentRepository shipments,
    IPickTaskRepository pickTasks,
    IShipmentCollectionRepository collections,
    IClock clock,
    ILogger<CustomerSuiteNumberChanger> logger)
{
    public async Task ApplyAsync(
        User user,
        string previousNumber,
        string newNumber,
        string regionCode,
        CancellationToken cancellationToken)
    {
        var userId = user.Id;
        var now = clock.UtcNow;
        var previous = previousNumber.Trim();
        var next = newNumber.Trim();

        if (string.Equals(previous, next, StringComparison.Ordinal))
        {
            return;
        }

        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (subscription is not null)
        {
            subscription.RebindSuiteNumber(next);
            await subscriptions.UpdateAsync(subscription, cancellationToken);
        }

        var suiteAddress = await addresses.GetSuiteForUserAsync(userId, cancellationToken);
        if (suiteAddress is not null)
        {
            suiteAddress.RebindSuiteNumber(next);
            await addresses.UpdateAsync(suiteAddress, cancellationToken);
        }

        var parcelList = await parcels.ListForUserAsync(userId, cancellationToken);
        foreach (var parcel in parcelList)
        {
            if (string.Equals(parcel.SuiteNumber, next, StringComparison.Ordinal))
            {
                continue;
            }

            parcel.RebindSuiteNumber(next);
            await parcels.UpdateAsync(parcel, cancellationToken);
        }

        var shipmentList = await shipments.ListForUserAsync(userId, cancellationToken);
        foreach (var shipment in shipmentList)
        {
            var pick = await pickTasks.GetByShipmentIdAsync(shipment.Id.Value, cancellationToken);
            if (pick is not null && !string.Equals(pick.SuiteNumber, next, StringComparison.Ordinal))
            {
                await pickTasks.UpdateAsync(pick with { SuiteNumber = next }, cancellationToken);
            }

            var collection = await collections.GetByShipmentIdAsync(shipment.Id.Value, cancellationToken);
            if (collection is not null && !string.Equals(collection.SuiteNumber, next, StringComparison.Ordinal))
            {
                await collections.UpsertAsync(collection with { SuiteNumber = next, UpdatedAtUtc = now }, cancellationToken);
            }
        }

        await SuiteLocationProvisioner.EnsureAsync(next, locations, clock, cancellationToken);

        var oldPoolEntry = await pool.GetByUserAsync(userId, cancellationToken);
        if (oldPoolEntry is not null
            && string.Equals(oldPoolEntry.Number, previous, StringComparison.Ordinal)
            && !string.Equals(oldPoolEntry.Number, next, StringComparison.Ordinal))
        {
            await pool.ReleaseAsync(oldPoolEntry.Id, now, cancellationToken);
        }

        logger.LogInformation(
            "Suite number updated for user {UserId} in {Region}: {Previous} → {New}",
            userId.Value,
            regionCode,
            previous,
            next);
    }
}
