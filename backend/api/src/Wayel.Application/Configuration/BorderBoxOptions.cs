namespace Wayel.Application.Configuration;

/// <summary>
/// WeYell / BorderBox customer-facing settings (links in notifications, etc.).
/// </summary>
public sealed class BorderBoxOptions
{
    public const string SectionName = "BorderBox";

    /// <summary>
    /// Customer portal origin used in WhatsApp deep links (no trailing slash).
    /// </summary>
    public string CustomerPortalBaseUrl { get; init; } = "http://localhost:8080";
}
