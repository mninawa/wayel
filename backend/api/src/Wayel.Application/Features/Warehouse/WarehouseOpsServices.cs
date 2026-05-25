using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

internal static class WarehouseDisplayIds
{
    internal static string Shipment(Guid shipmentId) =>
        $"SHP-{DateTime.UtcNow:yyyy}-{shipmentId.ToString("N")[..5].ToUpperInvariant()}";

    internal static string PickTask(Guid taskId) =>
        $"PICK-{DateTime.UtcNow:yyyy}-{taskId.ToString("N")[..3].ToUpperInvariant()}";

    internal static string Manifest(Guid manifestId) =>
        $"MAN-{DateTime.UtcNow:yyyyMMdd}-{manifestId.ToString("N")[..4].ToUpperInvariant()}";
}

internal static class WarehouseWeightCalculator
{
    internal static decimal VolumetricKg(string dimensionsLabel)
    {
        var parts = dimensionsLabel.Split('x', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3
            || !decimal.TryParse(parts[0], out var l)
            || !decimal.TryParse(parts[1], out var w)
            || !decimal.TryParse(parts[2], out var h))
        {
            return 0;
        }

        return Math.Round(l * w * h / 5000m, 2);
    }

    internal static decimal ChargeableKg(decimal actualKg, decimal volumetricKg) =>
        Math.Max(actualKg, volumetricKg);

    internal static string VarianceStatus(decimal chargeableKg, decimal? quotedKg, decimal thresholdPercent = 10m)
    {
        if (quotedKg is null or <= 0)
        {
            return "NONE";
        }

        var over = ((chargeableKg - quotedKg.Value) / quotedKg.Value) * 100m;
        return over > thresholdPercent ? "REVIEW" : "NONE";
    }
}

internal static class WarehouseTaskCreator
{
    internal static async Task CreateForPaidShipmentAsync(
        Shipment shipment,
        User user,
        IParcelRepository parcels,
        IParcelOpsMetadataRepository opsMetadata,
        IPickTaskRepository pickTasks,
        IPackingTaskRepository packingTasks,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (await pickTasks.GetByShipmentIdAsync(shipment.Id.Value, cancellationToken) is not null)
        {
            return;
        }

        var pickTaskId = Guid.NewGuid();
        var lines = new List<PickTaskParcelLine>();
        decimal quotedWeight = 0;
        string suite = "—";

        foreach (var parcelId in shipment.ParcelIds)
        {
            var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
            if (parcel is null)
            {
                continue;
            }

            suite = parcel.SuiteNumber;
            var meta = await opsMetadata.GetForParcelAsync(parcelId, cancellationToken);
            if (parcel.WeightKg is > 0)
            {
                quotedWeight += parcel.WeightKg.Value;
            }

            lines.Add(new PickTaskParcelLine(
                parcelId.Value,
                OpsParcelDisplayIds.Format(parcel),
                parcel.ItemName,
                meta?.LocationId ?? meta?.WarehouseLocation,
                PickParcelStatuses.PickPending,
                null,
                null,
                null));
        }

        await pickTasks.AddAsync(
            new PickTaskRecord(
                pickTaskId,
                WarehouseDisplayIds.PickTask(pickTaskId),
                shipment.Id.Value,
                PickTaskStatuses.Pending,
                null,
                user.DisplayName,
                suite,
                "Normal",
                lines,
                clock.UtcNow,
                null),
            cancellationToken);

        var packingTaskId = Guid.NewGuid();
        await packingTasks.AddAsync(
            new PackingTaskRecord(
                packingTaskId,
                shipment.Id.Value,
                WarehouseDisplayIds.Shipment(shipment.Id.Value),
                PackingTaskStatuses.Pending,
                "",
                user.DisplayName,
                "Eswatini",
                shipment.DeliveryMethod,
                1,
                null,
                null,
                null,
                false,
                null,
                null,
                quotedWeight > 0 ? quotedWeight : null,
                "NONE",
                null,
                clock.UtcNow,
                null),
            cancellationToken);
    }
}

internal static class WarehouseMovementWriter
{
    internal static async Task MoveParcelAsync(
        Guid parcelId,
        string? fromLocationId,
        string toLocationId,
        string movementType,
        string? notes,
        string? actor,
        IParcelRepository parcels,
        IParcelOpsMetadataRepository opsMetadata,
        IWarehouseLocationRepository locations,
        IWarehouseMovementRepository movements,
        IClock clock,
        IUnitOfWork unitOfWork,
        CancellationToken cancellationToken)
    {
        var pid = new ParcelId(parcelId);
        var parcel = await parcels.GetByIdAsync(pid, cancellationToken)
            ?? throw new InvalidOperationException("Parcel not found.");

        if (!string.IsNullOrWhiteSpace(fromLocationId))
        {
            await locations.TryDecrementOccupancyAsync(fromLocationId, cancellationToken);
        }

        await locations.TryIncrementOccupancyAsync(toLocationId, cancellationToken);

        var existing = await opsMetadata.GetForParcelAsync(pid, cancellationToken);
        var now = clock.UtcNow;
        var warehouseStatus = movementType switch
        {
            var t when t.Contains("Hold", StringComparison.OrdinalIgnoreCase) => ParcelWarehouseStatuses.OnHold,
            var t when t.Contains("Dispatch", StringComparison.OrdinalIgnoreCase) => ParcelWarehouseStatuses.DispatchStaging,
            var t when t.Contains("Packing", StringComparison.OrdinalIgnoreCase) => ParcelWarehouseStatuses.PackingPending,
            var t when t.Contains("Picking", StringComparison.OrdinalIgnoreCase) => ParcelWarehouseStatuses.PickingPending,
            _ => ParcelWarehouseStatuses.Stored,
        };

        await opsMetadata.UpsertAsync(
            new ParcelOpsMetadata(
                pid,
                toLocationId,
                existing?.ConditionStatus ?? "NOT_INSPECTED",
                existing?.InspectionNotes,
                existing?.PackagingType,
                existing?.OuterPackagingIntact ?? true,
                existing?.SealIntact ?? true,
                existing?.LabelReadable ?? true,
                existing?.GoodsAsDescribed ?? true,
                existing?.InspectedAtUtc,
                existing?.InspectedBy,
                now,
                toLocationId,
                warehouseStatus),
            cancellationToken);

        await movements.AddAsync(
            new WarehouseMovementRecord(
                Guid.NewGuid(),
                parcelId,
                fromLocationId,
                toLocationId,
                movementType,
                actor,
                now,
                notes),
            cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
