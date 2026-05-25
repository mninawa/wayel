using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuitePlatformConfigRepository
{
    Task<SuitePlatformSettings?> GetByRegionAsync(
        string regionCode,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SuitePlatformSettings>> ListAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(SuitePlatformSettings settings, CancellationToken cancellationToken = default);

    /// <summary>Atomically increments and returns the next sequential suite number value for a region.</summary>
    Task<long> AllocateNextSequenceAsync(
        string regionCode,
        CancellationToken cancellationToken = default);
}
