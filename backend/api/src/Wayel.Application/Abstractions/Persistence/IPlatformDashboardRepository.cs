using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Application.Abstractions.Persistence;

public interface IPlatformDashboardRepository
{
    Task<OpsPlatformDashboardDto> GetDashboardAsync(CancellationToken cancellationToken = default);
}
