using Wayel.Domain.Users;
using Wayel.Domain.SuiteSubscriptions;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuiteSubscriptionRepository
{
    Task<SuiteSubscription?> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default);

    Task<SuiteSubscription?> GetBySuiteNumberAsync(string suiteNumber, CancellationToken cancellationToken = default);

    Task AddAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);
    Task UpdateAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);

    Task<int> CountAssignedSuitesAsync(CancellationToken cancellationToken = default);

    Task<int> CountAssignedSuitesByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<UserId>> ListActiveSuiteUserIdsByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Find every suite number that is assigned to more than one user. Used by
    /// the ops "reconcile duplicates" workflow to surface historical collisions
    /// caused by the legacy hash allocator.
    /// </summary>
    Task<IReadOnlyList<SuiteNumberDuplicateGroup>> ListSuiteNumberDuplicatesAsync(
        CancellationToken cancellationToken = default);

    /// <summary>Active early-adopter trials (<see cref="SuiteSubscription.IsTrial"/> with unexpired access).</summary>
    Task<IReadOnlyList<SuiteSubscription>> ListActiveTrialsAsync(
        DateTime nowUtc,
        CancellationToken cancellationToken = default);
}

/// <summary>One conflicting suite number plus every subscription currently bound to it.</summary>
public sealed record SuiteNumberDuplicateGroup(
    string SuiteNumber,
    IReadOnlyList<SuiteNumberDuplicateMember> Members);

/// <summary>A single subscription inside a duplicate group, with enough context for ops triage.</summary>
public sealed record SuiteNumberDuplicateMember(
    UserId UserId,
    string Email,
    string DisplayName,
    string DestinationCountry,
    SuiteSubscriptionId SubscriptionId,
    SuiteAccessStatus Status,
    DateTime? StartedAt,
    DateTime? ExpiresAt);
