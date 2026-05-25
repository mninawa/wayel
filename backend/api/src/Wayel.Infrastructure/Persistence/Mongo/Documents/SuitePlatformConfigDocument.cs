using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class SuitePlatformConfigDocument
{
    public string Id { get; set; } = SuitePlatformSettings.Defaults.RegionCode;
    public string RegionCode { get; set; } = SuitePlatformSettings.Defaults.RegionCode;
    public string WarehouseName { get; set; } = "";
    public string AddressLine1 { get; set; } = "";
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = "";
    public string Province { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public string CountryCode { get; set; } = "";
    public int TotalSuiteCapacity { get; set; }
    public string NumberPrefix { get; set; } = "";
    public string GenerationMode { get; set; } = "";
    public int UserIdSuffixLength { get; set; }
    public int SequencePadLength { get; set; }
    public long NextSequenceNumber { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAtUtc { get; set; }

    public static SuitePlatformConfigDocument From(SuitePlatformSettings s)
    {
        var region = SuitePlatformRegions.Normalize(s.RegionCode);
        return new SuitePlatformConfigDocument
        {
            Id = region,
            RegionCode = region,
            WarehouseName = s.WarehouseName,
            AddressLine1 = s.AddressLine1,
            AddressLine2 = s.AddressLine2,
            City = s.City,
            Province = s.Province,
            PostalCode = s.PostalCode,
            CountryCode = s.CountryCode,
            TotalSuiteCapacity = s.TotalSuiteCapacity,
            NumberPrefix = s.NumberPrefix,
            GenerationMode = s.GenerationMode.ToString(),
            UserIdSuffixLength = s.UserIdSuffixLength,
            SequencePadLength = s.SequencePadLength,
            NextSequenceNumber = s.NextSequenceNumber,
            IsActive = s.IsActive,
            UpdatedAtUtc = s.UpdatedAtUtc,
        };
    }

    public SuitePlatformSettings ToDomain()
    {
        _ = Enum.TryParse<SuiteNumberGenerationMode>(GenerationMode, true, out var mode);
        var defaults = SuitePlatformSettings.ForRegion(RegionCode);
        return new SuitePlatformSettings(
            SuitePlatformRegions.Normalize(RegionCode),
            WarehouseName,
            AddressLine1,
            AddressLine2,
            City,
            Province,
            PostalCode,
            CountryCode,
            TotalSuiteCapacity > 0 ? TotalSuiteCapacity : defaults.TotalSuiteCapacity,
            string.IsNullOrWhiteSpace(NumberPrefix) ? defaults.NumberPrefix : NumberPrefix,
            mode,
            UserIdSuffixLength > 0 ? UserIdSuffixLength : defaults.UserIdSuffixLength,
            SequencePadLength > 0 ? SequencePadLength : defaults.SequencePadLength,
            NextSequenceNumber > 0 ? NextSequenceNumber : 1,
            IsActive,
            UpdatedAtUtc);
    }
}
