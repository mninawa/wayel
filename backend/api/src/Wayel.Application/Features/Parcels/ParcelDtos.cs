namespace Wayel.Application.Features.Parcels;

public sealed record ParcelListItemDto(
    Guid Id,
    string Retailer,
    string? TrackingNumber,
    string ItemName,
    string Category,
    string Status,
    decimal? WeightKg,
    decimal? DeclaredValueZar,
    string? DimensionsLabel,
    DateTime ReceivedAtUtc,
    string InvoiceStatus,
    string? InvoiceFileName,
    DateTime? InvoiceUploadedAtUtc,
    string QuoteState,
    string QuoteStateLabel,
    Guid? OpenQuoteId,
    string? OpenQuoteDisplayNumber,
    Guid? ShipmentId,
    bool CanRequestQuote,
    string? QuoteRequestBlocker);

public sealed record ParcelPhotoDto(
    Guid Id,
    string Url,
    string? Caption,
    DateTime? CapturedAtUtc);

public sealed record ParcelDetailDto(
    Guid Id,
    string SuiteNumber,
    string Retailer,
    string? TrackingNumber,
    string ItemName,
    string Category,
    string Status,
    decimal? WeightKg,
    decimal? DeclaredValueZar,
    string? DimensionsLabel,
    DateTime ReceivedAtUtc,
    int DaysInWarehouse,
    string InvoiceStatus,
    string? InvoiceFileName,
    long? InvoiceFileSizeBytes,
    DateTime? InvoiceUploadedAtUtc,
    bool CanUploadInvoice,
    string? InvoiceDownloadUrl,
    IReadOnlyList<ParcelPhotoDto> Photos,
    string QuoteState,
    string QuoteStateLabel,
    Guid? OpenQuoteId,
    string? OpenQuoteDisplayNumber,
    Guid? ShipmentId);

public sealed record UploadParcelInvoiceResultDto(
    Guid ParcelId,
    string InvoiceStatus,
    string FileName,
    DateTime UploadedAtUtc,
    string? DownloadUrl);
