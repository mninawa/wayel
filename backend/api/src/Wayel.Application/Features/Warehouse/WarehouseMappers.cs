using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Warehouse;

internal static class WarehouseMappers
{
    internal static OpsWarehouseLocationDto ToLocationDto(WarehouseLocationRecord r) =>
        new(r.LocationId, r.WarehouseId, r.Zone, r.Aisle, r.Shelf, r.Bin, r.Capacity, r.Occupancy, r.StorageType, r.Status, r.UpdatedAtUtc);

    internal static OpsWarehouseMovementDto ToMovementDto(WarehouseMovementRecord m, Parcel? parcel) =>
        new(m.MovementId, m.ParcelId, parcel is null ? null : OpsParcelDisplayIds.Format(parcel), m.FromLocationId, m.ToLocationId, m.MovementType, m.MovedBy, m.MovedAtUtc, m.Notes);

    internal static OpsPickTaskDto ToPickTaskDto(PickTaskRecord t) =>
        new(
            t.PickTaskId,
            t.DisplayId,
            t.ShipmentId,
            t.Status,
            t.AssignedTo,
            t.CustomerDisplayName,
            t.SuiteNumber,
            t.Priority,
            t.Parcels.Select(p => new OpsPickTaskParcelLineDto(
                p.ParcelId, p.DisplayId, p.ItemName, p.LocationId, p.PickStatus, p.PickedBy, p.PickedAtUtc, p.IssueReason)).ToList(),
            t.CreatedAtUtc,
            t.CompletedAtUtc);

    internal static OpsPackingTaskDto ToPackingTaskDto(PackingTaskRecord t) =>
        new(
            t.PackingTaskId, t.ShipmentId, t.ShipmentDisplayId, t.Status, t.DispatchStagingStatus,
            t.CustomerDisplayName, t.Destination, t.DeliveryMethod, t.PackageCount,
            t.FinalWeightKg, t.FinalDimensionsLabel, t.PackagingType, t.Sealed,
            t.VolumetricWeightKg, t.ChargeableWeightKg, t.QuotedWeightKg, t.VarianceStatus,
            t.Notes, t.CreatedAtUtc, t.CompletedAtUtc);
}
