using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlatform;

public sealed record GetOpsPlatformDashboardQuery : IQuery<OpsPlatformDashboardDto>;

internal sealed class GetOpsPlatformDashboardQueryHandler(IPlatformDashboardRepository dashboard)
    : IQueryHandler<GetOpsPlatformDashboardQuery, OpsPlatformDashboardDto>
{
    public async Task<Result<OpsPlatformDashboardDto>> Handle(
        GetOpsPlatformDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var dto = await dashboard.GetDashboardAsync(cancellationToken);
        return dto;
    }
}
