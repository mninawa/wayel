using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// Paged list of pay-later intents for the ops dashboard. <paramref name="Status"/>
/// is case-insensitive and accepts "pending" (default), "resolved", or "all".
/// Sort order is newest-first by <c>CreatedAtUtc</c>.
/// </summary>
public sealed record ListPayLaterIntentsQuery(string? Status, int Page, int PageSize)
    : IQuery<PayLaterIntentsPageDto>;

internal sealed class ListPayLaterIntentsQueryHandler(
    IPayLaterIntentRepository repository,
    IClock clock) : IQueryHandler<ListPayLaterIntentsQuery, PayLaterIntentsPageDto>
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    public async Task<Result<PayLaterIntentsPageDto>> Handle(
        ListPayLaterIntentsQuery request,
        CancellationToken cancellationToken)
    {
        var page = request.Page <= 0 ? 1 : request.Page;
        var pageSize = request.PageSize switch
        {
            <= 0 => DefaultPageSize,
            > MaxPageSize => MaxPageSize,
            _ => request.PageSize,
        };

        var filter = ParseStatus(request.Status);
        var skip = (page - 1) * pageSize;

        var totalTask = repository.CountAsync(filter, cancellationToken);
        var pageTask = repository.ListAsync(filter, skip, pageSize, cancellationToken);
        await Task.WhenAll(totalTask, pageTask).ConfigureAwait(false);

        var nowUtc = clock.UtcNow;
        var rows = pageTask.Result.Select(item => new PayLaterIntentRow(
            item.UserId.ToString(),
            item.Email,
            item.DisplayName,
            item.Phone,
            item.DestinationCountryCode,
            item.CreatedAtUtc.ToString("o"),
            item.LastSeenAtUtc.ToString("o"),
            item.ResolvedAtUtc?.ToString("o"),
            item.PlanAtSignalLabel,
            DaysBetween(item.CreatedAtUtc, item.ResolvedAtUtc ?? nowUtc),
            item.ResolvedAtUtc is null ? "pending" : "resolved"))
            .ToList();

        return new PayLaterIntentsPageDto(rows, totalTask.Result, page, pageSize);
    }

    private static PayLaterIntentStatusFilter ParseStatus(string? raw) =>
        (raw ?? "pending").Trim().ToLowerInvariant() switch
        {
            "resolved" => PayLaterIntentStatusFilter.Resolved,
            "all" => PayLaterIntentStatusFilter.All,
            _ => PayLaterIntentStatusFilter.Pending,
        };

    private static int DaysBetween(DateTime fromUtc, DateTime toUtc) =>
        (int)Math.Max(0, Math.Floor((toUtc - fromUtc).TotalDays));
}
