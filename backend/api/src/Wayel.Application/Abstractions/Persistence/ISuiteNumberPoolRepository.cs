using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

/// <summary>
/// Source of truth for suite-number uniqueness. The pool stores every minted
/// number (available + assigned) so a single atomic claim guarantees no two
/// users can be handed the same one even under heavy parallel sign-ups.
///
/// <para>
/// Lifecycle:
/// <list type="bullet">
///   <item><b>Pre-mint:</b> ops/system pre-creates Available rows by calling
///   <see cref="RefillAsync"/> with the next batch of formatted numbers.</item>
///   <item><b>Claim:</b> <see cref="TryClaimAvailableAsync"/> flips one Available
///   row to Assigned in a single Mongo operation and returns it.</item>
///   <item><b>Release:</b> <see cref="ReleaseAsync"/> hands a number back to the
///   pool (used by ops reconciliation, never by normal payment flows).</item>
/// </list>
/// </para>
/// </summary>
public interface ISuiteNumberPoolRepository
{
    /// <summary>Atomically claim the next available number for a region. Returns null when the pool is empty.</summary>
    Task<SuiteNumberPoolEntry?> TryClaimAvailableAsync(
        string regionCode,
        UserId userId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically claim a specific suite number for a user. Used by UserIdSuffix
    /// mode where the candidate number is derived from the user's id rather
    /// than pulled from a pre-minted Available pool. Returns the claimed entry
    /// on success, or null if the requested number is already taken (by anyone,
    /// including the same user — callers should pre-check ownership).
    /// </summary>
    Task<SuiteNumberPoolEntry?> TryClaimSpecificAsync(
        string regionCode,
        string requestedNumber,
        UserId userId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Inserts a batch of brand-new Available pool entries (skipping duplicates by number).</summary>
    /// <returns>The number of new rows actually inserted.</returns>
    Task<int> RefillAsync(
        string regionCode,
        IReadOnlyList<string> numbers,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Idempotently mark a real, in-use number as Assigned (used by the startup backfill).</summary>
    /// <returns><c>true</c> if a brand-new row was created, <c>false</c> if it already existed.</returns>
    Task<bool> EnsureAssignedAsync(
        string regionCode,
        string number,
        UserId userId,
        DateTime assignedAtUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Find the pool row currently bound to a user, if any.</summary>
    Task<SuiteNumberPoolEntry?> GetByUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default);

    /// <summary>Release a number (set status back to Available, clear assignment).</summary>
    Task ReleaseAsync(
        SuiteNumberPoolEntryId id,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>How many Available rows exist for a region — used by lazy refill.</summary>
    Task<int> CountAvailableAsync(
        string regionCode,
        CancellationToken cancellationToken = default);

    /// <summary>How many Assigned rows exist for a region — for capacity reporting.</summary>
    Task<int> CountAssignedAsync(
        string regionCode,
        CancellationToken cancellationToken = default);

    /// <summary>Return the numbers already in the pool from a candidate list — used by refill to skip dupes cheaply.</summary>
    Task<IReadOnlySet<string>> FilterExistingNumbersAsync(
        string regionCode,
        IReadOnlyCollection<string> candidateNumbers,
        CancellationToken cancellationToken = default);
}
