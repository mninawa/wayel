namespace Wayel.Application.Features.SuitePlatform;

public sealed record OpsPlatformDashboardMetricDto(
    string Label,
    string Value,
    string? Trend,
    string? TrendTone,
    string? Sub,
    string? SubTone,
    string Icon,
    string Tone);

public sealed record OpsPlatformRevenueMonthDto(
    string Label,
    decimal SuiteRevenueZar,
    decimal ShipmentRevenueZar);

public sealed record OpsPlatformForecastItemDto(
    string Label,
    string Value,
    string? Badge,
    string? BadgeTone);

public sealed record OpsPlatformRevenueBreakdownDto(
    string Label,
    decimal Pct,
    decimal AmountZar,
    string Color);

public sealed record OpsPlatformSuitePerformanceDto(
    string Label,
    string Value,
    string? Trend,
    string Tone);

public sealed record OpsPlatformShipmentBatchDto(
    string Id,
    string Destination,
    string Flag,
    int Parcels,
    decimal RevenueZar,
    string DispatchDate,
    string Status,
    string StatusTone);

public sealed record OpsPlatformCorridorDto(
    string Route,
    decimal RevenueZar,
    int Pct);

public sealed record OpsPlatformQuoteBucketDto(
    string Label,
    int Count,
    decimal RevenueZar);

public sealed record OpsPlatformExpiredCustomerDto(
    string Customer,
    int Parcels,
    int DaysExpired);

public sealed record OpsPlatformDashboardDto(
    string ScopeLabel,
    IReadOnlyList<OpsPlatformDashboardMetricDto> Metrics,
    IReadOnlyList<OpsPlatformRevenueMonthDto> RevenueMonths,
    IReadOnlyList<OpsPlatformForecastItemDto> ForecastItems,
    IReadOnlyList<OpsPlatformRevenueBreakdownDto> RevenueBreakdown,
    string DonutGradient,
    string DonutTotalLabel,
    IReadOnlyList<OpsPlatformSuitePerformanceDto> SuitePerformance,
    IReadOnlyList<OpsPlatformShipmentBatchDto> ShipmentBatches,
    int ShipmentBatchParcelTotal,
    decimal ShipmentBatchRevenueTotalZar,
    IReadOnlyList<OpsPlatformCorridorDto> Corridors,
    IReadOnlyList<OpsPlatformQuoteBucketDto> QuoteBuckets,
    int QuotesPendingTotal,
    IReadOnlyList<OpsPlatformExpiredCustomerDto> ExpiredCustomers,
    int ExpiredAttentionTotal);
