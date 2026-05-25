namespace Wayel.Application.Features.SuitePlatform;

public sealed record SuitePlatformRegionSummaryDto(
    string RegionCode,
    string DestinationCountryLabel,
    string CorridorLabel,
    string OriginCountryCode,
    bool IsActive,
    int AssignedSuiteCount,
    int TotalSuiteCapacity,
    int AvailableSuiteCount,
    string NumberPrefix,
    DateTime? UpdatedAtUtc);

public sealed record SuitePlatformConfigDto(
    string RegionCode,
    string DestinationCountryLabel,
    string CorridorLabel,
    string OriginCountryCode,
    bool IsActive,
    string WarehouseName,
    string AddressLine1,
    string? AddressLine2,
    string City,
    string Province,
    string PostalCode,
    string CountryCode,
    int TotalSuiteCapacity,
    int AssignedSuiteCount,
    int AvailableSuiteCount,
    string NumberPrefix,
    string GenerationMode,
    int UserIdSuffixLength,
    int SequencePadLength,
    long NextSequenceNumber,
    string PreviewNextSuiteNumber,
    DateTime UpdatedAtUtc);
