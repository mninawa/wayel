namespace Wayel.Application.Features.Quotes;

public sealed record QuoteSummaryDto(
    Guid Id,
    string DisplayNumber,
    decimal TotalLandedCost,
    string Status,
    string StatusLabel,
    DateTime CreatedAtUtc,
    DateTime ValidUntil,
    int ParcelCount,
    string DeliveryMethod,
    bool ShipOutLocked,
    bool HasPaymentInvoice,
    DateTime? PaymentPaidAtUtc,
    string? PaymentReference);

public sealed record QuotePaymentInvoiceFileDto(
    string FileName,
    string ContentType,
    Stream Content);

public sealed record QuoteBreakdownLineDto(string Label, decimal Amount, bool IncludedInTotal = true);

public sealed record QuoteLinkedParcelDto(
    Guid ParcelId,
    string Reference,
    string ItemName,
    string Retailer,
    decimal DeclaredValueZar,
    decimal? WeightKg,
    string? DimensionsLabel);

public sealed record QuoteDetailDto(
    Guid Id,
    string DisplayNumber,
    Guid? ShipmentId,
    DateTime CreatedAtUtc,
    DateTime? PublishedAtUtc,
    DateTime ValidUntil,
    string ShipTo,
    string DeliveryEstimate,
    decimal TotalLandedCost,
    decimal DeclaredGoodsValueZar,
    bool VatCharged,
    bool DutyCharged,
    decimal DutyGoodsValueThresholdZar,
    int ParcelCount,
    decimal TotalWeightKg,
    string DeliveryMethod,
    string Consolidation,
    string Warehouse,
    string Status,
    string StatusLabel,
    string? StatusReason,
    bool ShipOutLocked,
    bool CanApprove,
    bool CanPay,
    bool CanCancel,
    bool HasPaymentInvoice,
    IReadOnlyList<QuoteBreakdownLineDto> Breakdown,
    IReadOnlyList<QuoteLinkedParcelDto> LinkedParcels);

public sealed record BorderBoxPricingConfigDto(
    bool ChargeVat,
    bool ChargeWeightSurcharge,
    decimal PudoFlatFeeZar,
    decimal DoorToDoorFlatFeeZar,
    decimal PerKgSurchargeZar,
    decimal DutyRate,
    decimal VatRate,
    decimal DutyGoodsValueThresholdZar,
    decimal PaymentHandlingFeeRate,
    decimal HandlingFeeShareZar,
    decimal PickupFeeShareZar,
    DateTime UpdatedAtUtc);

public sealed record ParcelQuoteHistoryItemDto(
    Guid QuoteId,
    string DisplayNumber,
    string StatusLabel,
    decimal TotalLandedCost,
    DateTime ValidUntil,
    bool IsOpen);
