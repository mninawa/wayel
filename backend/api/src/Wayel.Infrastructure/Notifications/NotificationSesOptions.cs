namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// AWS SES settings for outbound invitation email. Binds to configuration section
/// <c>Notifications:Ses</c> (JSON <c>Notifications.Ses</c> or env <c>Notifications__Ses__*</c>).
/// </summary>
public sealed class NotificationSesOptions
{
    public const string SectionName = "Notifications:Ses";

    /// <summary>When <c>true</c>, invitation emails for <see cref="Wayel.Domain.Invitations.InvitationChannel.Email"/>
    /// and <c>Both</c> are sent via SES (sandbox restrictions apply until the account exits sandbox).</summary>
    public bool Enabled { get; init; }

    /// <summary>AWS region system name, e.g. <c>eu-west-1</c>.</summary>
    public string? Region { get; init; }

    /// <summary>Verified SES identity (email or domain). Example: <c>notifications@example.com</c>.</summary>
    public string? FromAddress { get; init; }

    /// <summary>Optional display name for the <c>From</c> header.</summary>
    public string? FromDisplayName { get; init; }

    /// <summary>Optional SES configuration set for event publishing / metrics.</summary>
    public string? ConfigurationSetName { get; init; }
}
