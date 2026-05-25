namespace Wayel.Application.Features.SuitePlatform;

using System.Globalization;

/// <summary>Per destination market suite configuration (shared SA warehouse, regional capacity and numbering).</summary>
public sealed record SuitePlatformSettings(
    string RegionCode,
    string WarehouseName,
    string AddressLine1,
    string? AddressLine2,
    string City,
    string Province,
    string PostalCode,
    string CountryCode,
    int TotalSuiteCapacity,
    string NumberPrefix,
    SuiteNumberGenerationMode GenerationMode,
    int UserIdSuffixLength,
    int SequencePadLength,
    long NextSequenceNumber,
    bool IsActive,
    DateTime UpdatedAtUtc)
{
    public const string LegacySingletonId = "default";

    public static SuitePlatformSettings Defaults => ForRegion("SZ");

    public static SuitePlatformSettings ForRegion(string regionCode)
    {
        var region = SuitePlatformRegions.Normalize(regionCode);
        var sharedAddress = (
            WarehouseName: "WeYell Sandton Warehouse",
            AddressLine1: "2 meerlust place,hurlingham manor",
            AddressLine2: (string?)null,
            City: "Sandton",
            Province: "Gauteng",
            PostalCode: "2192",
            CountryCode: "ZA");

        return region switch
        {
            "BW" => new SuitePlatformSettings(
                "BW",
                sharedAddress.WarehouseName,
                sharedAddress.AddressLine1,
                sharedAddress.AddressLine2,
                sharedAddress.City,
                sharedAddress.Province,
                sharedAddress.PostalCode,
                sharedAddress.CountryCode,
                TotalSuiteCapacity: 5_000,
                NumberPrefix: "WY-BW",
                SuiteNumberGenerationMode.UserIdSuffix,
                UserIdSuffixLength: 8,
                SequencePadLength: 6,
                NextSequenceNumber: 1,
                IsActive: false,
                UpdatedAtUtc: DateTime.UtcNow),
            "NA" => new SuitePlatformSettings(
                "NA",
                sharedAddress.WarehouseName,
                sharedAddress.AddressLine1,
                sharedAddress.AddressLine2,
                sharedAddress.City,
                sharedAddress.Province,
                sharedAddress.PostalCode,
                sharedAddress.CountryCode,
                TotalSuiteCapacity: 5_000,
                NumberPrefix: "WY-NA",
                SuiteNumberGenerationMode.UserIdSuffix,
                UserIdSuffixLength: 8,
                SequencePadLength: 6,
                NextSequenceNumber: 1,
                IsActive: false,
                UpdatedAtUtc: DateTime.UtcNow),
            _ => new SuitePlatformSettings(
                "SZ",
                sharedAddress.WarehouseName,
                sharedAddress.AddressLine1,
                sharedAddress.AddressLine2,
                sharedAddress.City,
                sharedAddress.Province,
                sharedAddress.PostalCode,
                sharedAddress.CountryCode,
                TotalSuiteCapacity: 10_000,
                NumberPrefix: "WY",
                SuiteNumberGenerationMode.UserIdSuffix,
                UserIdSuffixLength: 8,
                SequencePadLength: 6,
                NextSequenceNumber: 1,
                IsActive: true,
                UpdatedAtUtc: DateTime.UtcNow),
        };
    }

    public string BuildWarehouseLine(string suiteNumber) =>
        string.IsNullOrWhiteSpace(AddressLine2)
            ? AddressLine1.Trim()
            : $"{AddressLine1.Trim()}, {AddressLine2.Trim()}";

    public string PreviewSuiteNumber(Guid userId, long? sequenceOverride = null)
    {
        if (GenerationMode == SuiteNumberGenerationMode.Sequential)
        {
            var seq = sequenceOverride ?? NextSequenceNumber;
            return FormatSequential(seq);
        }

        var suffixLength = Math.Clamp(UserIdSuffixLength, 4, 32);
        var suffix = userId.ToString("N")[..Math.Min(suffixLength, 32)].ToUpperInvariant();
        return $"{NumberPrefix.Trim().ToUpperInvariant()}-{suffix}";
    }

    public string FormatSequential(long sequence) =>
        $"{NumberPrefix.Trim().ToUpperInvariant()}-{sequence.ToString(CultureInfo.InvariantCulture).PadLeft(Math.Clamp(SequencePadLength, 4, 12), '0')}";

    public SuitePlatformConfigDto ToDto(int assignedSuiteCount, string previewNextSuiteNumber) =>
        new(
            RegionCode,
            SuitePlatformRegions.DestinationLabel(RegionCode),
            SuitePlatformRegions.CorridorLabel(RegionCode),
            SuitePlatformRegions.OriginCountryCode,
            IsActive,
            WarehouseName,
            AddressLine1,
            AddressLine2,
            City,
            Province,
            PostalCode,
            CountryCode,
            TotalSuiteCapacity,
            assignedSuiteCount,
            Math.Max(0, TotalSuiteCapacity - assignedSuiteCount),
            NumberPrefix,
            GenerationMode.ToString(),
            UserIdSuffixLength,
            SequencePadLength,
            NextSequenceNumber,
            previewNextSuiteNumber,
            UpdatedAtUtc);

    public SuitePlatformRegionSummaryDto ToSummary(int assignedSuiteCount) =>
        new(
            RegionCode,
            SuitePlatformRegions.DestinationLabel(RegionCode),
            SuitePlatformRegions.CorridorLabel(RegionCode),
            SuitePlatformRegions.OriginCountryCode,
            IsActive,
            assignedSuiteCount,
            TotalSuiteCapacity,
            Math.Max(0, TotalSuiteCapacity - assignedSuiteCount),
            NumberPrefix,
            UpdatedAtUtc);
}
