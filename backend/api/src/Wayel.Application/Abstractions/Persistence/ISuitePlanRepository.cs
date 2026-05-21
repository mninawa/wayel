using Wayel.Domain.SuitePlans;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuitePlanRepository
{
    Task<IReadOnlyList<SuitePlan>> ListActiveAsync(CancellationToken cancellationToken = default);
    Task<SuitePlan?> GetByIdAsync(SuitePlanId id, CancellationToken cancellationToken = default);
}
