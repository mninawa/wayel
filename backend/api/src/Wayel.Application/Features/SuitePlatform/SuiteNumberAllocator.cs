using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Pool-backed suite number allocation. Replaces the legacy in-process hash
/// derivation (first N hex chars of user.Id) that collided for users created
/// in the same time window — UUID v7 starts with a timestamp so birthday-style
/// collisions on a 5–8 hex prefix were nearly guaranteed at modest scale.
///
/// <para>
/// Allocation strategy:
/// <list type="number">
///   <item>If the user already has a subscription with a number, keep it.</item>
///   <item>Otherwise try to atomically claim the next Available row from
///   <see cref="ISuiteNumberPoolRepository"/>.</item>
///   <item>If the pool is empty for the region, lazily refill it by minting
///   the next batch using the region's Sequential format, then retry.</item>
/// </list>
/// </para>
/// </summary>
internal sealed class SuiteNumberAllocator(
    ISuitePlatformConfigRepository configRepository,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteNumberPoolRepository pool,
    IClock clock,
    ILogger<SuiteNumberAllocator> logger) : ISuiteNumberAllocator
{
    /// <summary>
    /// Lazy refill size. Big enough that 99% of sign-ups don't trigger a
    /// refill, small enough that an unused region doesn't bloat the pool.
    /// </summary>
    private const int RefillBatchSize = 200;

    public async Task<string> ResolveAsync(
        User user,
        SuiteSubscription? existingSubscription,
        bool allocateNew,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(existingSubscription?.SuiteNumber))
        {
            return existingSubscription.SuiteNumber.Trim();
        }

        var region = SuitePlatformRegions.Normalize(user.DestinationCountry);
        var settings = await SuitePlatformConfigLoader.LoadAsync(configRepository, region, cancellationToken);

        if (!allocateNew)
        {
            // Initiate-checkout previews the number before payment, so we
            // can't claim a pool entry yet (the user might abandon and we'd
            // burn the number). Return a stable per-user placeholder that
            // never gets persisted anywhere — it only feeds Paystack's
            // reference prefix and the metadata bag.
            return BuildPreview(settings, user.Id);
        }

        var assignedNow = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
        if (assignedNow >= settings.TotalSuiteCapacity)
        {
            throw new InvalidOperationException(
                $"No suite numbers available for {SuitePlatformRegions.CorridorLabel(region)}. Increase regional capacity or retire inactive suites.");
        }

        var now = clock.UtcNow;

        // First attempt: claim from existing Available rows.
        var claimed = await pool.TryClaimAvailableAsync(region, user.Id, now, cancellationToken);
        if (claimed is not null)
        {
            return claimed.Number;
        }

        // Pool is empty for this region — refill lazily and retry.
        var minted = await RefillPoolAsync(region, settings, cancellationToken);
        logger.LogInformation(
            "Suite number pool was empty for {Region}; minted {Count} new numbers via lazy refill.",
            region,
            minted);

        claimed = await pool.TryClaimAvailableAsync(region, user.Id, now, cancellationToken);
        if (claimed is null)
        {
            // Either someone else drained the just-minted batch or the
            // sequence is exhausted. Surface as capacity exhaustion — the
            // caller already returns a clean validation error.
            throw new InvalidOperationException(
                $"Suite number pool for {SuitePlatformRegions.CorridorLabel(region)} could not be replenished. Check the regional capacity setting.");
        }

        return claimed.Number;
    }

    private async Task<int> RefillPoolAsync(
        string region,
        SuitePlatformSettings settings,
        CancellationToken cancellationToken)
    {
        var minted = new List<string>(RefillBatchSize);
        for (var i = 0; i < RefillBatchSize; i++)
        {
            var seq = await configRepository.AllocateNextSequenceAsync(region, cancellationToken);
            if (seq > settings.TotalSuiteCapacity)
            {
                // Roll back into the capacity cap: stop minting once we'd
                // exceed the configured ceiling for the region.
                break;
            }

            minted.Add(settings.FormatSequential(seq));
        }

        if (minted.Count == 0)
        {
            return 0;
        }

        return await pool.RefillAsync(region, minted, clock.UtcNow, cancellationToken);
    }

    /// <summary>
    /// Deterministic placeholder for the pre-payment preview. Stable per user
    /// so a refresh of the checkout page renders the same string. Never written
    /// to a subscription/address — those always come from the pool claim.
    /// </summary>
    private static string BuildPreview(SuitePlatformSettings settings, UserId userId)
    {
        var suffixLength = Math.Clamp(settings.UserIdSuffixLength, 4, 32);
        var suffix = userId.Value.ToString("N")[..Math.Min(suffixLength, 32)].ToUpperInvariant();
        return $"{settings.NumberPrefix.Trim().ToUpperInvariant()}-{suffix}";
    }
}
