using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Pool-backed suite number allocation that preserves the configured display
/// format (typically <c>{COUNTRY}-{HEX}</c> via <see cref="SuiteNumberGenerationMode.UserIdSuffix"/>)
/// while making collisions impossible.
///
/// <para>
/// The legacy in-process allocator returned the first N hex chars of a UUID v7
/// directly, which collided for any two users created in the same time window
/// (the first 32 bits of a v7 are upper bits of a millisecond timestamp).
/// We now insert each claim into a <c>suite_number_pool</c> row whose
/// <c>Number</c> column has a unique index — a single Mongo insert is the
/// atomic primitive that lets exactly one user win a given hex slice.
/// </para>
///
/// <para>
/// On the rare collision (two sign-ups within ~65 seconds) we fall back to a
/// rotated slice of the same UUID — UUID v7's high-entropy tail is fully
/// random, so collisions there are 1-in-4-billion territory. The suite number
/// stays the same width and shape; ops can't tell which sign-up "lost the
/// race" by looking at the address.
/// </para>
/// </summary>
internal sealed class SuiteNumberAllocator(
    ISuitePlatformConfigRepository configRepository,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteNumberPoolRepository pool,
    IClock clock,
    ILogger<SuiteNumberAllocator> logger) : ISuiteNumberAllocator
{
    /// <summary>Lazy refill size for Sequential mode. Big enough that most
    /// sign-ups don't trigger a refill, small enough that an unused region
    /// doesn't bloat the pool.</summary>
    private const int SequentialRefillBatchSize = 200;

    /// <summary>Cap on candidate retries for UserIdSuffix mode. Beyond this we
    /// fall back to Sequential allocation rather than spinning forever — five
    /// independent slices of a UUID v7 colliding simultaneously is astronomically
    /// unlikely, so hitting this cap almost certainly means the pool is broken.</summary>
    private const int MaxUserIdSuffixCandidates = 5;

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
            // Initiate-checkout previews the number before payment lands. We
            // can't claim a pool entry yet — the customer might abandon and
            // we'd burn the hex slice. Return a stable per-user placeholder
            // that only flows into the Paystack reference prefix; it's never
            // persisted to a subscription or address.
            return BuildPrimaryCandidate(settings, user.Id);
        }

        // Pre-check ownership: if this user already claimed a pool entry on a
        // previous attempt that failed to land the subscription rewrite (rare
        // crash recovery), reuse it instead of minting a new one.
        var existingPoolEntry = await pool.GetByUserAsync(user.Id, cancellationToken);
        if (existingPoolEntry is not null)
        {
            return existingPoolEntry.Number;
        }

        var assignedNow = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
        if (assignedNow >= settings.TotalSuiteCapacity)
        {
            throw new InvalidOperationException(
                $"No suite numbers available for {SuitePlatformRegions.CorridorLabel(region)}. Increase regional capacity or retire inactive suites.");
        }

        var now = clock.UtcNow;

        return settings.GenerationMode switch
        {
            SuiteNumberGenerationMode.Sequential =>
                await AllocateFromSequentialPoolAsync(region, settings, user.Id, now, cancellationToken),
            _ =>
                await AllocateFromUserIdHashAsync(region, settings, user, now, cancellationToken),
        };
    }

    /// <summary>
    /// UserIdSuffix mode: derive a candidate from the user's UUID and atomically
    /// claim it. On collision, rotate the hex slice and try again.
    /// </summary>
    private async Task<string> AllocateFromUserIdHashAsync(
        string region,
        SuitePlatformSettings settings,
        User user,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var attemptCount = 0;
        foreach (var candidate in EnumerateUserIdCandidates(settings, user.Id))
        {
            attemptCount++;
            var claimed = await pool.TryClaimSpecificAsync(region, candidate, user.Id, now, cancellationToken);
            if (claimed is not null)
            {
                if (attemptCount > 1)
                {
                    logger.LogInformation(
                        "Suite number collision avoided for user {UserId} after {Attempts} attempts in {Region} (final: {Number})",
                        user.Id.Value,
                        attemptCount,
                        region,
                        candidate);
                }
                return claimed.Number;
            }

            if (attemptCount >= MaxUserIdSuffixCandidates)
            {
                break;
            }
        }

        // Five independent UUID slices all colliding is effectively impossible
        // without a bug. Fall back to a fresh Sequential number from the pool
        // so the customer still ends up with a valid address rather than a
        // hard 500.
        logger.LogError(
            "Exhausted UserIdSuffix candidates for {UserId} in {Region}; falling back to Sequential allocation.",
            user.Id.Value,
            region);
        return await AllocateFromSequentialPoolAsync(region, settings, user.Id, now, cancellationToken);
    }

    /// <summary>
    /// Sequential mode: pull the next pre-minted Available row. Lazy-mints
    /// the next batch when the pool runs dry for a region.
    /// </summary>
    private async Task<string> AllocateFromSequentialPoolAsync(
        string region,
        SuitePlatformSettings settings,
        UserId userId,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var claimed = await pool.TryClaimAvailableAsync(region, userId, now, cancellationToken);
        if (claimed is not null)
        {
            return claimed.Number;
        }

        var minted = await RefillSequentialPoolAsync(region, settings, cancellationToken);
        logger.LogInformation(
            "Suite number pool was empty for {Region}; minted {Count} new Sequential numbers via lazy refill.",
            region,
            minted);

        claimed = await pool.TryClaimAvailableAsync(region, userId, now, cancellationToken);
        if (claimed is null)
        {
            throw new InvalidOperationException(
                $"Suite number pool for {SuitePlatformRegions.CorridorLabel(region)} could not be replenished. Check the regional capacity setting.");
        }

        return claimed.Number;
    }

    private async Task<int> RefillSequentialPoolAsync(
        string region,
        SuitePlatformSettings settings,
        CancellationToken cancellationToken)
    {
        var minted = new List<string>(SequentialRefillBatchSize);
        for (var i = 0; i < SequentialRefillBatchSize; i++)
        {
            var seq = await configRepository.AllocateNextSequenceAsync(region, cancellationToken);
            if (seq > settings.TotalSuiteCapacity)
            {
                break;
            }

            minted.Add(settings.FormatSequential(seq));
        }

        return minted.Count == 0
            ? 0
            : await pool.RefillAsync(region, minted, clock.UtcNow, cancellationToken);
    }

    /// <summary>
    /// Generate the candidate suite numbers we'll try in order. The first
    /// candidate is the "clean" timestamp-prefix slice that most customers
    /// will get; subsequent candidates rotate to other slices of the same
    /// UUID, so the suffix length stays constant and no ugly disambiguation
    /// markers (e.g. "-2") creep into anyone's mailing address.
    /// </summary>
    internal static IEnumerable<string> EnumerateUserIdCandidates(SuitePlatformSettings settings, UserId userId)
    {
        var hex = userId.Value.ToString("N").ToUpperInvariant();
        var prefix = settings.NumberPrefix.Trim().ToUpperInvariant();
        var suffixLength = Math.Clamp(settings.UserIdSuffixLength, 4, 16);

        // Candidate 1: leading slice. UUID v7's leading 48 bits are timestamp
        // so two users in the same ~65s window share this hex; the rest of
        // the candidate ladder catches them.
        yield return Format(prefix, hex, 0, suffixLength);

        // Candidate 2: trailing slice. UUID v7's bottom 62 bits are fully
        // random — collision probability over the entire user base is < 1
        // in 4 billion at suffixLength=8, so this is the effective stopper.
        var trailingStart = Math.Max(0, hex.Length - suffixLength);
        yield return Format(prefix, hex, trailingStart, suffixLength);

        // Candidate 3+: rotated slices for the extreme edge case where the
        // trailing hex itself is in use (e.g. someone happens to have the
        // exact 8 random hex chars as another user's trailing — possible but
        // exceedingly rare).
        for (var start = suffixLength; start + suffixLength <= hex.Length; start += 2)
        {
            yield return Format(prefix, hex, start, suffixLength);
        }

        static string Format(string prefix, string hex, int start, int length)
        {
            var slice = hex.Substring(start, length);
            return $"{prefix}-{slice}";
        }
    }

    /// <summary>
    /// Deterministic placeholder for the pre-payment preview. Identical to the
    /// first allocation candidate so the customer sees the exact number they'll
    /// be assigned in the common case.
    /// </summary>
    private static string BuildPrimaryCandidate(SuitePlatformSettings settings, UserId userId) =>
        EnumerateUserIdCandidates(settings, userId).First();
}
