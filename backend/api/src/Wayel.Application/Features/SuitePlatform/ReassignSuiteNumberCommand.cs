using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Ops command: release the suite number currently bound to <paramref name="UserId"/>
/// back to the pool and claim a fresh one. Used by the duplicate-reconciliation
/// workflow — never called by normal customer flows.
///
/// <para>Atomicity boundary: the pool claim is itself atomic, but the subsequent
/// subscription/address/location updates are not transactional. We sequence them
/// in dependency order (claim → subscription → address) so a mid-flight crash
/// leaves a recoverable state: pool entry binds the new number to the user even
/// if the subscription rewrite didn't land, and a re-run of the command picks
/// up where the previous attempt left off.</para>
/// </summary>
public sealed record ReassignSuiteNumberCommand(Guid UserId) : ICommand<ReassignSuiteNumberResult>;

public sealed record ReassignSuiteNumberResult(
    Guid UserId,
    string PreviousSuiteNumber,
    string NewSuiteNumber);

internal sealed class ReassignSuiteNumberCommandHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberPoolRepository pool,
    ISuiteNumberAllocator allocator,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<ReassignSuiteNumberCommandHandler> logger)
    : ICommandHandler<ReassignSuiteNumberCommand, ReassignSuiteNumberResult>
{
    public async Task<Result<ReassignSuiteNumberResult>> Handle(
        ReassignSuiteNumberCommand request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);

        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(userId);
        }

        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (subscription is null)
        {
            return Error.NotFound("suite_subscription.not_found", "User has no suite subscription to reassign.");
        }

        var previous = subscription.SuiteNumber;
        if (string.IsNullOrWhiteSpace(previous))
        {
            return Error.Validation(
                "suite_subscription.no_number",
                "Subscription has no suite number yet — let the customer complete checkout first.");
        }

        // Pull settings for the user's actual destination region — that's the
        // pool we're going to claim from. Falls back to the SZ default if the
        // user's country never had a per-region config saved.
        var region = SuitePlatformRegions.Normalize(user.DestinationCountry);
        var settings = await SuitePlatformConfigLoader.LoadAsync(platformConfig, region, cancellationToken);

        // Claim the new number before we touch anything else. If the pool is
        // empty we let the allocator's lazy refill kick in via ResolveAsync
        // with no existing subscription number to inherit.
        string newNumber;
        try
        {
            newNumber = await allocator.ResolveAsync(
                user,
                existingSubscription: null,
                allocateNew: true,
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("suite_platform.capacity_exhausted", ex.Message);
        }

        if (string.Equals(previous, newNumber, StringComparison.Ordinal))
        {
            return Error.Validation(
                "suite_subscription.reassign_noop",
                "Pool returned the same number — check that the pool isn't empty or restricted.");
        }

        var now = clock.UtcNow;

        // Release the old pool entry first (if we have one for this user) so
        // the previous number can flow back to other waiting sign-ups. We do
        // this AFTER claiming the new one so a failed claim doesn't strand
        // the user.
        var oldPoolEntry = await pool.GetByUserAsync(userId, cancellationToken);
        if (oldPoolEntry is not null && string.Equals(oldPoolEntry.Number, previous, StringComparison.Ordinal))
        {
            await pool.ReleaseAsync(oldPoolEntry.Id, now, cancellationToken);
        }

        subscription.RebindSuiteNumber(newNumber);
        await subscriptions.UpdateAsync(subscription, cancellationToken);

        var existingAddress = await addresses.GetSuiteForUserAsync(userId, cancellationToken);
        if (existingAddress is not null)
        {
            existingAddress.RebindSuiteNumber(newNumber);
            await addresses.UpdateAsync(existingAddress, cancellationToken);
        }

        // Spin up a warehouse location for the new number so receiving ops can
        // stash the next inbound parcel under the right postbox. The previous
        // location row is left in place — historical movement audit trails
        // would otherwise dangle.
        await SuiteLocationProvisioner.EnsureAsync(newNumber, locations, clock, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "Reassigned suite number for user {UserId}: {Previous} → {New} (region: {Region})",
            userId.Value,
            previous,
            newNumber,
            settings.RegionCode);

        return new ReassignSuiteNumberResult(userId.Value, previous, newNumber);
    }
}
