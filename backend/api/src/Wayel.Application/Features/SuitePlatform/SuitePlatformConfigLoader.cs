using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Application.Features.SuitePlatform;

internal static class SuitePlatformConfigLoader
{
    public static async Task<SuitePlatformSettings> LoadAsync(
        ISuitePlatformConfigRepository repository,
        string regionCode,
        CancellationToken cancellationToken)
    {
        var region = SuitePlatformRegions.Normalize(regionCode);
        var stored = await repository.GetByRegionAsync(region, cancellationToken);
        return stored ?? SuitePlatformSettings.ForRegion(region);
    }
}
