namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// What we tell the SPA about a customer's pay-later choice. Returned both from
/// the dedicated /onboarding/pay-later endpoint and (more importantly) embedded
/// in the /account response so guards can route synchronously on bootstrap.
/// </summary>
public sealed record OnboardingIntentDto(
    string Kind,
    string CreatedAtUtc,
    string LastSeenAtUtc,
    string? PlanIdAtSignal,
    string? PlanLabelAtSignal);

/// <summary>Aggregate KPI numbers for the ops "Onboarding Funnel" panel.</summary>
public sealed record PayLaterStatsDto(
    int TotalEver,
    int CurrentlyPending,
    int ResolvedTotal,
    int ResolvedLast7Days,
    int NewLast7Days,
    int StalePending,
    double? AverageHoursToResolve);

public sealed record PayLaterIntentRow(
    string UserId,
    string Email,
    string DisplayName,
    string Phone,
    string DestinationCountryCode,
    string CreatedAtUtc,
    string LastSeenAtUtc,
    string? ResolvedAtUtc,
    string? PlanAtSignalLabel,
    int DaysWaiting,
    string Status);

public sealed record PayLaterIntentsPageDto(
    IReadOnlyList<PayLaterIntentRow> Items,
    int Total,
    int Page,
    int PageSize);
