namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Provider-agnostic settings for outbound transactional email. Binds
/// to configuration section <c>Notifications:Email</c> (env
/// <c>Notifications__Email__*</c>).
///
/// <para>
/// Every email <see cref="Wayel.Application.Abstractions.Notifications.IEmailTransport"/>
/// shares the same <c>Enabled</c> flag, From-address, and display
/// name. Provider-specific settings (SES region / configuration set,
/// Resend API key) live on their own option classes
/// (<see cref="NotificationSesOptions"/>, <see cref="NotificationResendOptions"/>).
/// </para>
/// </summary>
public sealed class NotificationEmailOptions
{
    public const string SectionName = "Notifications:Email";

    /// <summary>
    /// When <c>true</c>, the configured email transport is used for
    /// outbound notifications. When <c>false</c> (or no transport is
    /// registered) the dispatcher falls back to
    /// <c>ConsoleNotificationSender</c> in Development.
    /// </summary>
    public bool Enabled { get; init; } = true;

    /// <summary>
    /// Verified sending identity. Either a bare address
    /// (<c>"notifications@felidaen.co"</c>) or `Name &lt;addr&gt;` form.
    /// Resend / SES both require this domain to be verified in the
    /// provider dashboard before sends succeed.
    /// </summary>
    public string? FromAddress { get; init; }

    /// <summary>
    /// Optional display name appended to the From header when
    /// <see cref="FromAddress"/> is a bare address.
    /// </summary>
    public string? FromDisplayName { get; init; }
}
