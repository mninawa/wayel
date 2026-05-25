namespace Wayel.Application.Features.Parcels;

public sealed record OpsConsolidationInventoryItemDto(
    Guid ParcelId,
    string DisplayId,
    string? TrackingNumber,
    string CustomerDisplayName,
    string SuiteNumber,
    string Retailer,
    string ItemName,
    string Status,
    string? WarehouseLocation,
    int DaysInWarehouse,
    decimal? WeightKg,
    string QuoteReadiness,
    DateTime ReceivedAtUtc);

public sealed record UpdateOpsParcelStorageLocationResultDto(
    Guid ParcelId,
    string? WarehouseLocation,
    string Message);

public sealed record OpsConsolidationPickParcelDto(
    Guid ParcelId,
    string DisplayId,
    string ItemName,
    string? WarehouseLocation,
    decimal? WeightKg);

public sealed record OpsConsolidationReadyShipmentDto(
    Guid ShipmentId,
    string CustomerDisplayName,
    string SuiteNumber,
    string DeliveryMethod,
    int ParcelCount,
    decimal TotalWeightKg,
    bool ReadyForDispatch,
    DateTime? PaidAtUtc,
    IReadOnlyList<OpsConsolidationPickParcelDto> Parcels);

public sealed record MarkOpsConsolidationPackedResultDto(
    Guid ShipmentId,
    bool ReadyForDispatch,
    string Message);

public sealed record OpsConsolidationDispatchBatchResultDto(
    int DispatchedCount,
    IReadOnlyList<Guid> ShipmentIds,
    string Message);
