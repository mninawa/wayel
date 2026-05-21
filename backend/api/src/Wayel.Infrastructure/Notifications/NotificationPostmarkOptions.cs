namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Postmark (postmarkapp.com) settings for outbound transactional email.
/// Binds to configuration section <c>Notifications:Postmark</c>
/// (env <c>Notifications__Postmark__*</c>).
///
/// <para>
/// Pick this provider by setting <c>Notifications:Provider = "postmark"</c>.
/// Resend and SES remain available — flip the provider switch back to
/// <c>"resend"</c> or <c>"ses"</c> to migrate without redeploying.
/// </para>
///
/// <para>
/// Postmark requires a verified <em>Sender Signature</em> (single
/// address) <em>or</em> a verified <em>domain</em> before any send
/// succeeds. The transport doesn't enforce this — it'll happily POST
/// to the API and let Postmark return a typed error (<c>ErrorCode 405</c>
/// "Sender signature not confirmed") which we surface in the audit log.
/// </para>
/// </summary>
public sealed class NotificationPostmarkOptions
{
    public const string SectionName = "Notifications:Postmark";

    /// <summary>
    /// Server-scoped API token issued from the Postmark dashboard
    /// (<c>https://account.postmarkapp.com/account/api_tokens</c>).
    /// Sent as the <c>X-Postmark-Server-Token</c> header on every
    /// request.
    ///
    /// <para>
    /// Required when <c>Notifications:Provider == "postmark"</c>;
    /// ignored otherwise. Source from a secret store / env var, never
    /// commit to git.
    /// </para>
    /// </summary>
    public string? ServerToken { get; init; }

    /// <summary>
    /// Verified sending identity. Either a full address
    /// (<c>"mninawa@felidaen.co"</c>) or a `Name &lt;addr&gt;` form
    /// (<c>"Wayel &lt;notifications@felidaen.co&gt;"</c>). Postmark
    /// requires either the address to match a confirmed Sender
    /// Signature or the domain portion to match a verified DKIM domain
    /// before the message will be relayed.
    /// </summary>
    public string? FromAddress { get; init; }

    /// <summary>
    /// Optional display name appended to the From header when
    /// <see cref="FromAddress"/> is a bare address. Postmark renders
    /// `Name &lt;addr&gt;` either way.
    /// </summary>
    public string? FromDisplayName { get; init; }

    /// <summary>
    /// Postmark message stream identifier — Postmark routes outgoing
    /// mail through one of the streams configured on the server.
    /// Transactional sends should stay on the default <c>outbound</c>
    /// stream; bulk / broadcast streams require a separate stream id
    /// and have different rate-limit characteristics. Override only
    /// when an operator deliberately reconfigures the Postmark server.
    /// </summary>
    public string MessageStream { get; init; } = "outbound";

    /// <summary>
    /// Optional override for the API base URL — defaults to Postmark's
    /// production endpoint. Useful for tests / staging proxies.
    /// </summary>
    public string ApiBaseUrl { get; init; } = "https://api.postmarkapp.com";
}
