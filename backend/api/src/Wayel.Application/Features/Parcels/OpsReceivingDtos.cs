namespace Wayel.Application.Features.Parcels;

public sealed record OpsPagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record OpsExceptionItemDto(
    Guid ParcelId,
    string DisplayId,
    string? TrackingNumber,
    string ExceptionType,
    string Severity,
    string Status,
    string Retailer,
    string CustomerDisplayName,
    string SuiteNumber,
    DateTime ReceivedAtUtc,
    string? AssignedTo,
    string? EscalatedTo,
    DateTime? DueAtUtc,
    bool IsOverdue,
    string? Notes);

public sealed record OpsActivityItemDto(
    Guid Id,
    string EventType,
    string Title,
    string? Detail,
    string? Actor,
    DateTime OccurredAtUtc);

public sealed record OpsPhotoDto(
    Guid PhotoId,
    string Category,
    string FileName,
    string ContentType,
    DateTime UploadedAtUtc,
    string? UploadedBy);

public sealed record OpsPhotoUploadTicketDto(
    Guid PhotoId,
    string UploadUrl,
    IReadOnlyDictionary<string, string> UploadHeaders,
    DateTime ExpiresAtUtc);

public sealed record DeleteOpsPhotoResultDto(Guid PhotoId, string Message);

public sealed record OpsReadyForQuoteItemDto(
    Guid ParcelId,
    string DisplayId,
    string CustomerDisplayName,
    string SuiteNumber,
    string Retailer,
    string ItemName,
    decimal? WeightKg,
    decimal? DeclaredValueZar,
    string InvoiceStatus,
    string ConditionStatus,
    string QuoteReadiness,
    DateTime ReceivedAtUtc);

public sealed record OpsInspectionDto(
    string ConditionStatus,
    string? WarehouseLocation,
    string? PackagingType,
    bool OuterPackagingIntact,
    bool SealIntact,
    bool LabelReadable,
    bool GoodsAsDescribed,
    string? InspectionNotes,
    DateTime? InspectedAtUtc,
    string? InspectedBy);

public sealed record VerifyOpsInvoiceResultDto(
    Guid ParcelId,
    string InvoiceStatus,
    string QuoteReadiness,
    string Message);

public sealed record UploadOpsInvoiceResultDto(
    Guid ParcelId,
    string InvoiceStatus,
    string FileName,
    DateTime UploadedAtUtc,
    string Message);

public sealed record SaveOpsInspectionResultDto(
    Guid ParcelId,
    string ConditionStatus,
    string QuoteReadiness,
    DateTime InspectedAtUtc,
    string InvoiceReminderWhatsAppStatus,
    string? InvoiceReminderWhatsAppDetail);

public sealed record SendToQuoteQueueResultDto(
    IReadOnlyList<Guid> ParcelIds,
    int SentCount,
    string Message);
