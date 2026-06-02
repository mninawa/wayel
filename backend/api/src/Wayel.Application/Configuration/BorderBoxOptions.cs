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
    /// Full WhatsApp click-to-chat URL for the Support page (e.g.
    /// <c>https://wa.me/message/NEGKMQLT5LJNE1</c> for a Business short
    /// link, or <c>https://wa.me/27821234567</c>). Takes precedence over
    /// <see cref="SupportWhatsAppE164"/>.
    /// </summary>
    public string SupportWhatsAppLink { get; init; } = "";

    /// <summary>
    /// Label shown under the WhatsApp channel when
    /// <see cref="SupportWhatsAppLink"/> is set. Empty uses a generic default.
    /// </summary>
    public string SupportWhatsAppLabel { get; init; } = "";

    /// <summary>
    /// E.164 digits-only fallback when <see cref="SupportWhatsAppLink"/> is
    /// empty (we build <c>https://wa.me/&lt;digits&gt;</c>). Also falls back
    /// to <c>Notifications:WaSender:SupportInboxPhoneE164</c> when unset.
    /// </summary>
    public string SupportWhatsAppE164 { get; init; } = "";

    /// <summary>
    /// Inbox address customers tap on the Support page to email our
    /// team. Empty disables the email launcher.
    /// </summary>
    public string SupportEmail { get; init; } = "";

    /// <summary>
    /// Optional free-trial onboarding for new customers (no upfront payment).
    /// </summary>
    public BorderBoxTrialAccessOptions TrialAccess { get; init; } = new();
}

/// <summary>
/// Controls whether new customers can activate suite access without paying upfront.
/// </summary>
public sealed class BorderBoxTrialAccessOptions
{
    /// <summary>Master switch. Off by default — enable per environment.</summary>
    public bool Enabled { get; init; }

    /// <summary>Length of the complimentary access window.</summary>
    public int DurationDays { get; init; } = 30;
}
