using Wayel.Domain.SuitePlans;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuitePlanRepository
{
    Task<IReadOnlyList<SuitePlan>> ListActiveAsync(CancellationToken cancellationToken = default);

    /// <summary>Includes inactive (archived) plans. Used by the ops admin UI.</summary>
    Task<IReadOnlyList<SuitePlan>> ListAllAsync(CancellationToken cancellationToken = default);

    Task<SuitePlan?> GetByIdAsync(SuitePlanId id, CancellationToken cancellationToken = default);

    Task AddAsync(SuitePlan plan, CancellationToken cancellationToken = default);

    Task UpdateAsync(SuitePlan plan, CancellationToken cancellationToken = default);
}
