using Wayel.Domain.PickupBranches;

namespace Wayel.Application.Abstractions.Persistence;

public interface IPickupBranchRepository
{
    Task<IReadOnlyList<PickupBranch>> ListActiveAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PickupBranch>> ListAllAsync(CancellationToken cancellationToken = default);

    Task<PickupBranch?> GetByIdAsync(string id, CancellationToken cancellationToken = default);
}
