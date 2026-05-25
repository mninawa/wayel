namespace Wayel.Application.Features.Warehouse;

public sealed record OpsWarehouseZoneCapacityDto(
    string Zone,
    int TotalCapacity,
    int Occupancy,
    int UtilizationPercent,
    int LocationCount);

public sealed record OpsWarehousePendingTaskDto(
    string TaskType,
    string TaskId,
    string DisplayId,
    string Status,
    string Priority,
    string CustomerDisplayName,
    DateTime CreatedAtUtc);

public sealed record OpsWarehouseActivityDto(
    Guid MovementId,
    Guid ParcelId,
    string? ParcelDisplayId,
    string MovementType,
    string ToLocationId,
    string? MovedBy,
    DateTime MovedAtUtc);

public sealed record OpsWarehouseDashboardDto(
    int StoredParcels,
    int PendingPickTasks,
    int PendingPackingTasks,
    int ReadyForDispatch,
    int OnHoldParcels,
    IReadOnlyList<OpsWarehouseZoneCapacityDto> ZoneCapacities,
    IReadOnlyList<OpsWarehousePendingTaskDto> PendingTasks,
    IReadOnlyList<OpsWarehouseActivityDto> RecentActivity);

public sealed record OpsWarehouseBoardCardDto(
    string CardKey,
    string CardType,
    string ColumnId,
    Guid? ParcelId,
    Guid? ShipmentId,
    Guid? TaskId,
    string DisplayId,
    string Title,
    string? Subtitle,
    string StatusLabel,
    string? LocationId,
    string? SuiteNumber,
    string? Retailer,
    string? CustomerDisplayName,
    string? Destination,
    string? DeliveryMethod,
    int? ParcelCount,
    decimal? WeightKg,
    string? AssignedTo,
    DateTime? DueAtUtc,
    DateTime? EventAtUtc,
    bool IsOverdue,
    string? IssueSummary,
    string? TrackingNumber = null,
    DateTime? ReceivedAtUtc = null,
    DateTime? UpdatedAtUtc = null,
    DateTime? DispatchByUtc = null,
    int? OverdueMinutes = null,
    string? PickupLabel = null,
    string? InvoiceStatusLabel = null,
    string? InspectionLabel = null,
    Guid? CoverPhotoId = null);

public sealed record OpsWarehouseBoardColumnDto(
    string ColumnId,
    string Label,
    string Subtitle,
    int Count,
    int OverdueCount,
    IReadOnlyList<OpsWarehouseBoardCardDto> Cards);

public sealed record OpsWarehouseBoardDto(
    IReadOnlyList<OpsWarehouseBoardColumnDto> Columns,
    IReadOnlyList<OpsWarehouseBoardCardDto> ExceptionCards);

public sealed record OpsWarehouseBoardMoveResultDto(
    string Message,
    string FromColumnId,
    string ToColumnId);

public sealed record OpsWarehouseBoardTransitionsDto(
    string FromColumnId,
    IReadOnlyList<string> AllowedToColumnIds);

public sealed record OpsWarehouseLocationDto(
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

public sealed record OpsWarehouseMovementDto(
    Guid MovementId,
    Guid ParcelId,
    string? ParcelDisplayId,
    string? FromLocationId,
    string ToLocationId,
    string MovementType,
    string? MovedBy,
    DateTime MovedAtUtc,
    string? Notes);

public sealed record OpsPickTaskParcelLineDto(
    Guid ParcelId,
    string DisplayId,
    string ItemName,
    string? LocationId,
    string PickStatus,
    string? PickedBy,
    DateTime? PickedAtUtc,
    string? IssueReason);

public sealed record OpsPickTaskDto(
    Guid PickTaskId,
    string DisplayId,
    Guid ShipmentId,
    string Status,
    string? AssignedTo,
    string CustomerDisplayName,
    string SuiteNumber,
    string Priority,
    IReadOnlyList<OpsPickTaskParcelLineDto> Parcels,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public sealed record OpsPackingTaskDto(
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

public sealed record OpsDispatchStagingItemDto(
    Guid ShipmentId,
    string ShipmentDisplayId,
    string CustomerDisplayName,
    string SuiteNumber,
    string DeliveryMethod,
    string DispatchStagingStatus,
    int ParcelCount,
    decimal TotalWeightKg,
    DateTime? ReadyAtUtc);

public sealed record OpsDispatchManifestDto(
    Guid ManifestId,
    string DisplayId,
    string Courier,
    DateTime DispatchDate,
    string? PickupWindow,
    string Status,
    IReadOnlyList<Guid> ShipmentIds,
    int ShipmentCount,
    string? ProofOfHandover,
    DateTime CreatedAtUtc,
    DateTime? HandedOverAtUtc);

public sealed record OpsDispatchManifestShipmentRowDto(
    Guid ShipmentId,
    string DisplayId,
    string Customer,
    string Destination,
    int Packages,
    decimal WeightKg,
    string LabelStatus);

public sealed record OpsDispatchManifestHandoverCheckDto(string Label, bool Done);

public sealed record OpsDispatchManifestDetailDto(
    OpsDispatchManifestDto Manifest,
    decimal TotalWeightKg,
    int TotalPackages,
    IReadOnlyList<OpsDispatchManifestShipmentRowDto> Shipments,
    IReadOnlyList<OpsDispatchManifestHandoverCheckDto> Checks);

public sealed record OpsParcelStorageDto(
    Guid ParcelId,
    string DisplayId,
    string? TrackingNumber,
    string CustomerDisplayName,
    string SuiteNumber,
    string ItemName,
    string Status,
    string? CurrentLocationId,
    string? CurrentLocationLabel,
    int DaysInWarehouse,
    IReadOnlyList<OpsWarehouseLocationDto> EligibleLocations,
    string? SuggestedLocationId,
    string? SuggestedLocationLabel);

public sealed record WarehouseActionResultDto(string Message);

public sealed record OpsPagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);
