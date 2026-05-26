using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// Aggregate metrics for the ops "Onboarding funnel" panel: total ever, pending,
/// resolved, 7-day cohorts, stale pending (> 14 days no activity), and average
/// hours to resolution.
/// </summary>
public sealed record GetPayLaterStatsQuery : IQuery<PayLaterStatsDto>;

internal sealed class GetPayLaterStatsQueryHandler(
    IPayLaterIntentRepository repository,
    IClock clock) : IQueryHandler<GetPayLaterStatsQuery, PayLaterStatsDto>
{
    private static readonly TimeSpan StaleThreshold = TimeSpan.FromDays(14);

    public async Task<Result<PayLaterStatsDto>> Handle(
        GetPayLaterStatsQuery request,
        CancellationToken cancellationToken)
    {
        var stats = await repository.GetStatsAsync(clock.UtcNow, StaleThreshold, cancellationToken);
        return new PayLaterStatsDto(
            stats.TotalEver,
            stats.CurrentlyPending,
            stats.ResolvedTotal,
            stats.ResolvedLast7Days,
            stats.NewLast7Days,
            stats.StalePending,
            stats.AverageHoursToResolve);
    }
}
