namespace Wayel.Application.Abstractions.Persistence;

public sealed record WarehouseLocationRecord(
    string LocationId,
    string WarehouseId,
    string Zone,
    string Aisle,
    string Shelf,
    string Bin,
    int Capacity,
    int Occupancy,
    string StorageType,
    string Status,
    DateTime UpdatedAtUtc);

public sealed record WarehouseLocationPage(IReadOnlyList<WarehouseLocationRecord> Items, int TotalCount);

public interface IWarehouseLocationRepository
{
    Task<WarehouseLocationPage> ListPageAsync(
        int page,
        int pageSize,
        string? zone = null,
        string? status = null,
        string? search = null,
        CancellationToken cancellationToken = default);

    Task<WarehouseLocationRecord?> GetByIdAsync(string locationId, CancellationToken cancellationToken = default);

    Task UpsertAsync(WarehouseLocationRecord location, CancellationToken cancellationToken = default);

    Task<bool> TryIncrementOccupancyAsync(string locationId, CancellationToken cancellationToken = default);

    Task<bool> TryDecrementOccupancyAsync(string locationId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WarehouseLocationRecord>> ListByWarehouseAsync(
        string warehouseId,
        CancellationToken cancellationToken = default);
}

public sealed record WarehouseMovementRecord(
    Guid MovementId,
    Guid ParcelId,
    string? FromLocationId,
    string ToLocationId,
    string MovementType,
    string? MovedBy,
    DateTime MovedAtUtc,
    string? Notes);

public sealed record WarehouseMovementPage(IReadOnlyList<WarehouseMovementRecord> Items, int TotalCount);

public interface IWarehouseMovementRepository
{
    Task<WarehouseMovementPage> ListPageAsync(
        int page,
        int pageSize,
        Guid? parcelId = null,
        string? movementType = null,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        CancellationToken cancellationToken = default);

    Task AddAsync(WarehouseMovementRecord movement, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WarehouseMovementRecord>> ListRecentAsync(int limit, CancellationToken cancellationToken = default);
}

public sealed record PickTaskParcelLine(
    Guid ParcelId,
    string DisplayId,
    string ItemName,
    string? LocationId,
    string PickStatus,
    string? PickedBy,
    DateTime? PickedAtUtc,
    string? IssueReason);

public sealed record PickTaskRecord(
    Guid PickTaskId,
    string DisplayId,
    Guid ShipmentId,
    string Status,
    string? AssignedTo,
    string CustomerDisplayName,
    string SuiteNumber,
    string Priority,
    IReadOnlyList<PickTaskParcelLine> Parcels,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public sealed record PickTaskPage(IReadOnlyList<PickTaskRecord> Items, int TotalCount);

public interface IPickTaskRepository
{
    Task<PickTaskPage> ListPageAsync(
        int page,
        int pageSize,
        string? status = null,
        CancellationToken cancellationToken = default);

    Task<PickTaskRecord?> GetByIdAsync(Guid pickTaskId, CancellationToken cancellationToken = default);

    Task<PickTaskRecord?> GetByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);

    Task<PickTaskRecord?> FindByParcelIdAsync(Guid parcelId, CancellationToken cancellationToken = default);

    Task AddAsync(PickTaskRecord task, CancellationToken cancellationToken = default);

    Task UpdateAsync(PickTaskRecord task, CancellationToken cancellationToken = default);

    Task<int> CountByStatusAsync(string status, CancellationToken cancellationToken = default);
}

public sealed record PackingTaskRecord(
    Guid PackingTaskId,
    Guid ShipmentId,
    string ShipmentDisplayId,
    string Status,
    string DispatchStagingStatus,
    string CustomerDisplayName,
    string Destination,
    string DeliveryMethod,
    int PackageCount,
    decimal? FinalWeightKg,
    string? FinalDimensionsLabel,
    string? PackagingType,
    bool Sealed,
    decimal? VolumetricWeightKg,
    decimal? ChargeableWeightKg,
    decimal? QuotedWeightKg,
    string VarianceStatus,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public sealed record PackingTaskPage(IReadOnlyList<PackingTaskRecord> Items, int TotalCount);

public interface IPackingTaskRepository
{
    Task<PackingTaskPage> ListPageAsync(
        int page,
        int pageSize,
        string? status = null,
        CancellationToken cancellationToken = default);

    Task<PackingTaskRecord?> GetByIdAsync(Guid packingTaskId, CancellationToken cancellationToken = default);

    Task<PackingTaskRecord?> GetByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);

    Task AddAsync(PackingTaskRecord task, CancellationToken cancellationToken = default);

    Task UpdateAsync(PackingTaskRecord task, CancellationToken cancellationToken = default);

    Task<int> CountByStatusAsync(string status, CancellationToken cancellationToken = default);

    Task<int> CountByDispatchStatusAsync(string dispatchStatus, CancellationToken cancellationToken = default);
}

public sealed record DispatchManifestRecord(
    Guid ManifestId,
    string DisplayId,
    string Courier,
    DateTime DispatchDate,
    string? PickupWindow,
    string Status,
    IReadOnlyList<Guid> ShipmentIds,
    string? ProofOfHandover,
    DateTime CreatedAtUtc,
    DateTime? HandedOverAtUtc);

public sealed record DispatchManifestPage(IReadOnlyList<DispatchManifestRecord> Items, int TotalCount);

public interface IDispatchManifestRepository
{
    Task<DispatchManifestPage> ListPageAsync(int page, int pageSize, CancellationToken cancellationToken = default);

    Task<DispatchManifestRecord?> GetByIdAsync(Guid manifestId, CancellationToken cancellationToken = default);

    Task AddAsync(DispatchManifestRecord manifest, CancellationToken cancellationToken = default);

    Task UpdateAsync(DispatchManifestRecord manifest, CancellationToken cancellationToken = default);
}
