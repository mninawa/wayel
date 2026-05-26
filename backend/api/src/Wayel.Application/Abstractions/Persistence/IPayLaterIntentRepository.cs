using Wayel.Domain.Onboarding;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

/// <summary>One row in a paged list of pay-later intents for the ops dashboard.</summary>
public sealed record PayLaterIntentListItem(
    Guid UserId,
    string Email,
    string DisplayName,
    string Phone,
    string DestinationCountryCode,
    DateTime CreatedAtUtc,
    DateTime LastSeenAtUtc,
    DateTime? ResolvedAtUtc,
    string? PlanAtSignalLabel);

/// <summary>Aggregate KPI numbers for the ops "Onboarding Funnel" panel.</summary>
public sealed record PayLaterStatsSnapshot(
    int TotalEver,
    int CurrentlyPending,
    int ResolvedTotal,
    int ResolvedLast7Days,
    int NewLast7Days,
    int StalePending,
    double? AverageHoursToResolve);

public enum PayLaterIntentStatusFilter
{
    All,
    Pending,
    Resolved,
}

public interface IPayLaterIntentRepository
{
    Task<PayLaterIntent?> GetByUserAsync(UserId userId, CancellationToken cancellationToken = default);

    Task UpsertAsync(PayLaterIntent intent, CancellationToken cancellationToken = default);

    /// <summary>
    /// Mark the intent resolved if it exists. No-op when there is no intent for the user
    /// (i.e. they never chose Pay Later). Safe to call from payment-completion paths.
    /// </summary>
    Task<bool> MarkResolvedAsync(
        UserId userId,
        DateTime resolvedAtUtc,
        CancellationToken cancellationToken = default);

    Task<PayLaterStatsSnapshot> GetStatsAsync(
        DateTime nowUtc,
        TimeSpan stalePendingThreshold,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PayLaterIntentListItem>> ListAsync(
        PayLaterIntentStatusFilter status,
        int skip,
        int take,
        CancellationToken cancellationToken = default);

    Task<int> CountAsync(
        PayLaterIntentStatusFilter status,
        CancellationToken cancellationToken = default);
}
