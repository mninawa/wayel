namespace Wayel.Application.Features.Parcels;

public sealed record OpsReceivingStatsDto(
    int ReceivedToday,
    int UnmatchedParcels,
    int AwaitingInvoice,
    int ReadyForQuote,
    int Exceptions);

public sealed record OpsParcelQueueItemDto(
    Guid ParcelId,
    string DisplayId,
    string? TrackingNumber,
    string Retailer,
    string ItemName,
    string CustomerDisplayName,
    string CustomerEmail,
    string SuiteNumber,
    string SuiteMatchStatus,
    string InvoiceStatus,
    string ConditionStatus,
    string Status,
    string StatusLabel,
    DateTime ReceivedAtUtc);

public sealed record OpsReceivingDashboardDto(
    OpsReceivingStatsDto Stats,
    IReadOnlyList<OpsParcelQueueItemDto> Queue);

public sealed record OpsParcelDetailDto(
    Guid ParcelId,
    string DisplayId,
    string CustomerDisplayName,
    string CustomerEmail,
    string? CustomerPhone,
    string SuiteNumber,
    string Retailer,
    string? TrackingNumber,
    string ItemName,
    string Category,
    string Status,
    string StatusLabel,
    decimal? WeightKg,
    decimal? DeclaredValueZar,
    string? DimensionsLabel,
    DateTime ReceivedAtUtc,
    int DaysInWarehouse,
    string InvoiceStatus,
    string? InvoiceFileName,
    DateTime? InvoiceUploadedAtUtc,
    string QuoteState,
    string QuoteStateLabel,
    Guid? ShipmentId,
    string QuoteReadiness,
    IReadOnlyList<string> ReadinessBlockers,
    OpsInspectionDto? Inspection);
