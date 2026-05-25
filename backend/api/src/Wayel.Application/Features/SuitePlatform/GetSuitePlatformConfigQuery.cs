using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlatform;

public sealed record ListSuitePlatformRegionsQuery : IQuery<IReadOnlyList<SuitePlatformRegionSummaryDto>>;

internal sealed class ListSuitePlatformRegionsQueryHandler(
    ISuitePlatformConfigRepository repository,
    ISuiteSubscriptionRepository subscriptions)
    : IQueryHandler<ListSuitePlatformRegionsQuery, IReadOnlyList<SuitePlatformRegionSummaryDto>>
{
    public async Task<Result<IReadOnlyList<SuitePlatformRegionSummaryDto>>> Handle(
        ListSuitePlatformRegionsQuery request,
        CancellationToken cancellationToken)
    {
        var configs = await repository.ListAsync(cancellationToken);
        var summaries = new List<SuitePlatformRegionSummaryDto>();
        foreach (var config in configs)
        {
            var assigned = await subscriptions.CountAssignedSuitesByRegionAsync(config.RegionCode, cancellationToken);
            summaries.Add(config.ToSummary(assigned));
        }

        return summaries;
    }
}

public sealed record GetSuitePlatformConfigQuery(string RegionCode) : IQuery<SuitePlatformConfigDto>;

internal sealed class GetSuitePlatformConfigQueryHandler(
    ISuitePlatformConfigRepository repository,
    ISuiteSubscriptionRepository subscriptions)
    : IQueryHandler<GetSuitePlatformConfigQuery, SuitePlatformConfigDto>
{
    public async Task<Result<SuitePlatformConfigDto>> Handle(
        GetSuitePlatformConfigQuery request,
        CancellationToken cancellationToken)
    {
        var region = SuitePlatformRegions.Normalize(request.RegionCode);
        var settings = await SuitePlatformConfigLoader.LoadAsync(repository, region, cancellationToken);
        var assigned = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
        var preview = settings.GenerationMode == SuiteNumberGenerationMode.Sequential
            ? settings.FormatSequential(settings.NextSequenceNumber)
            : settings.PreviewSuiteNumber(new Guid("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        return settings.ToDto(assigned, preview);
    }
}
