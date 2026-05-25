using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

public static class SuiteLocationProvisioner
{
    public static async Task<WarehouseLocationRecord?> EnsureAsync(
        string? suiteNumber,
        IWarehouseLocationRepository locations,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            return null;
        }

        var trimmed = suiteNumber.Trim();
        var locationId = WarehouseConstants.FormatSuiteLocationId(trimmed);
        var existing = await locations.GetByIdAsync(locationId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var record = new WarehouseLocationRecord(
            locationId,
            WarehouseConstants.DefaultWarehouseId,
            WarehouseConstants.SuiteZone,
            trimmed,
            "00",
            "00",
            WarehouseConstants.DefaultSuiteCapacity,
            0,
            WarehouseConstants.SuiteStorageType,
            WarehouseLocationStatuses.Active,
            clock.UtcNow);

        await locations.UpsertAsync(record, cancellationToken);
        return record;
    }

    public static string SuitePostboxLabel(string suiteNumber) =>
        $"Suite {suiteNumber.Trim()}";
}
