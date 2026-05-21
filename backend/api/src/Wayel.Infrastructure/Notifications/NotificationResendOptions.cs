namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Resend (resend.com) settings for outbound transactional email.
/// Binds to configuration section <c>Notifications:Resend</c>
/// (env <c>Notifications__Resend__*</c>).
///
/// <para>
/// Pick this provider by setting <c>Notifications:Provider = "resend"</c>.
/// SES remains available — flip the provider switch back to <c>"ses"</c>
/// to migrate without redeploying.
/// </para>
/// </summary>
public sealed class NotificationResendOptions
{
    public const string SectionName = "Notifications:Resend";

    /// <summary>
    /// API key issued from the Resend dashboard. Format: <c>re_…</c>.
    /// Required when <c>Notifications:Provider == "resend"</c>; ignored
    /// otherwise. Source from a secret store / env var, never commit
    /// to git.
    /// </summary>
    public string? ApiKey { get; init; }

    /// <summary>
    /// Verified sending identity. Either a full address
    /// (<c>"mninawa@felidaen.co"</c>) or a `Name &lt;addr&gt;` form
    /// (<c>"Wayel &lt;notifications@felidaen.co&gt;"</c>). Resend
    /// requires the domain be verified in their dashboard before any
    /// send succeeds.
    /// </summary>
    public string? FromAddress { get; init; }

    /// <summary>
    /// Optional display name appended to the From header when
    /// <see cref="FromAddress"/> is a bare address. Resend renders
    /// `Name &lt;addr&gt;` either way.
    /// </summary>
    public string? FromDisplayName { get; init; }

    /// <summary>
    /// Optional Resend audience id used to attach incoming sends to a
    /// specific Resend audience (e.g. for bounce-list segmentation).
    /// We do not use Resend audiences today; reserved for future use.
    /// </summary>
    public string? AudienceId { get; init; }

    /// <summary>
    /// Optional override for the API base URL — defaults to Resend's
    /// production endpoint. Useful for tests / staging.
    /// </summary>
    public string ApiBaseUrl { get; init; } = "https://api.resend.com";
}
