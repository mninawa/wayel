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

    /// <summary>
    /// E.164 phone number customers tap on the Support page to start a
    /// WhatsApp conversation with our team. We hand-build the
    /// <c>https://wa.me/&lt;digits&gt;</c> deep link from this in the
    /// support overview response, so it must not contain a '+' or
    /// spaces (e.g. <c>27821234567</c>). Empty disables the WhatsApp
    /// launcher in the UI.
    /// </summary>
    public string SupportWhatsAppE164 { get; init; } = "";

    /// <summary>
    /// Inbox address customers tap on the Support page to email our
    /// team. Empty disables the email launcher.
    /// </summary>
    public string SupportEmail { get; init; } = "";
}
