using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Addresses;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

internal static class SuiteSubscriptionActivator
{
    public static async Task<Result<SuiteSubscriptionDto>> ActivateOrRenewAsync(
        User user,
        SuitePlan plan,
        ISuiteSubscriptionRepository subscriptions,
        ICustomerAddressRepository addresses,
        IWarehouseLocationRepository locations,
        ISuitePlatformConfigRepository platformConfig,
        ISuiteNumberAllocator suiteNumbers,
        IUnitOfWork unitOfWork,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var existing = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var region = SuitePlatformRegions.Normalize(user.DestinationCountry);
        var settings = await SuitePlatformConfigLoader.LoadAsync(platformConfig, region, cancellationToken);

        string suiteNumber;
        try
        {
            suiteNumber = await suiteNumbers.ResolveAsync(user, existing, allocateNew: true, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("suite_platform.capacity_exhausted", ex.Message);
        }

        SuiteSubscription subscription;
        if (existing is null)
        {
            subscription = SuiteSubscription.CreatePending(user.Id, plan.Id, suiteNumber);
            subscription.Activate(clock.UtcNow, clock.UtcNow.AddMonths(plan.DurationMonths));
            await subscriptions.AddAsync(subscription, cancellationToken);

            if (await addresses.GetSuiteForUserAsync(user.Id, cancellationToken) is null)
            {
                var suiteAddress = CustomerAddress.CreateSuite(
                    user.Id,
                    suiteNumber,
                    settings.BuildWarehouseLine(suiteNumber),
                    settings.City,
                    settings.Province,
                    settings.CountryCode,
                    settings.PostalCode);
                suiteAddress.SyncSuiteRecipient(user.DisplayName, user.Phone);
                await addresses.AddAsync(suiteAddress, cancellationToken);
            }
        }
        else
        {
            subscription = existing;
            if (existing.Status is SuiteAccessStatus.PendingPayment || existing.StartedAt is null)
            {
                subscription.Activate(clock.UtcNow, clock.UtcNow.AddMonths(plan.DurationMonths));
            }
            else
            {
                var anchor = existing.ExpiresAt > clock.UtcNow
                    ? existing.ExpiresAt.Value
                    : clock.UtcNow;
                subscription.Renew(anchor.AddMonths(plan.DurationMonths));
            }

            await subscriptions.UpdateAsync(subscription, cancellationToken);
        }

        await SuiteLocationProvisioner.EnsureAsync(suiteNumber, locations, clock, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new SuiteSubscriptionDto(
            subscription.Id.Value,
            subscription.Status.ToString(),
            subscription.SuiteNumber,
            subscription.ExpiresAt,
            subscription.ShipOutLocked);
    }
}
