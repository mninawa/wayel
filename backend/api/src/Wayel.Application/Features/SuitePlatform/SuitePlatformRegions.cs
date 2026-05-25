namespace Wayel.Application.Features.SuitePlatform;

public static class SuitePlatformRegions
{
    public const string OriginCountryCode = "ZA";

    public static readonly IReadOnlyList<string> Supported = ["SZ", "BW", "NA"];

    public static string Normalize(string regionCode)
    {
        if (string.IsNullOrWhiteSpace(regionCode))
        {
            return "SZ";
        }

        var normalized = regionCode.Trim().ToUpperInvariant();
        return Supported.Contains(normalized, StringComparer.Ordinal)
            ? normalized
            : "SZ";
    }

    public static string DestinationLabel(string regionCode) =>
        Normalize(regionCode) switch
        {
            "SZ" => "Eswatini",
            "BW" => "Botswana",
            "NA" => "Namibia",
            _ => regionCode,
        };

    public static string OriginLabel => "South Africa";

    public static string CorridorLabel(string regionCode) =>
        $"{OriginLabel} → {DestinationLabel(regionCode)}";

    public static string FlagEmoji(string regionCode) =>
        Normalize(regionCode) switch
        {
            "SZ" => "🇸🇿",
            "BW" => "🇧🇼",
            "NA" => "🇳🇦",
            _ => "🌍",
        };
}
