namespace Wayel.Application.Configuration;

/// <summary>
/// Read-only view of <c>Notifications:WaSender</c> for application features
/// (support test, overview flags). Transport credentials stay in Infrastructure.
/// </summary>
public sealed class WaSenderNotificationOptions
{
    public const string SectionName = "Notifications:WaSender";

    public bool Enabled { get; init; }

    public string? ApiKey { get; init; }

    /// <summary>
    /// Ops inbox used for outbound ticket/exception alerts. Also used as the
    /// customer-facing click-to-chat number when neither
    /// <see cref="BorderBoxOptions.SupportWhatsAppLink"/> nor
    /// <see cref="BorderBoxOptions.SupportWhatsAppE164"/> is set (wa.me does
    /// not require Wasender to be enabled).
    /// </summary>
    public string? SupportInboxPhoneE164 { get; init; }

    public bool IsConfiguredForDelivery =>
        Enabled && !string.IsNullOrWhiteSpace(ApiKey);
}
