namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Configuration for the WasenderAPI WhatsApp channel
/// (<see href="https://wasenderapi.com" />). The transport drives a
/// QR-linked WhatsApp session — not Meta's official Cloud API — so the
/// only credentials we hold are a per-session bearer token issued by
/// the Wasender dashboard after the operator scans the QR code from
/// the linked phone.
///
/// <para>
/// Every field is optional in shape so the section can sit in
/// <c>appsettings.json</c> with safe defaults;
/// <see cref="NotificationWaSenderOptionsValidator"/> fails fast at
/// startup if <see cref="Enabled"/> is true and any transport-critical
/// field is missing — same pattern as the Postmark / SES options.
/// </para>
///
/// <para>
/// We never log <see cref="ApiKey"/>; provide it via
/// <c>NOTIFICATIONS__WASENDER__APIKEY</c> in the env block so it stays
/// out of source control. Rotate the key by pressing "Regenerate" on
/// the session in the Wasender dashboard; the old key is invalidated
/// immediately.
/// </para>
///
/// <para>
/// TOS posture: WasenderAPI is an unofficial WhatsApp gateway built
/// on the Baileys-style WebSocket protocol. WhatsApp can disconnect
/// or ban the linked number if its spam classifiers flag the session,
/// so keep volume to recipients-who-expect-us (invitations,
/// subscription decisions tied to a parent who started a conversation
/// with the tenant) and avoid bulk fan-out to cold contacts.
/// </para>
/// </summary>
public sealed class NotificationWaSenderOptions
{
    public const string SectionName = "Notifications:WaSender";

    /// <summary>Master toggle. When false the dispatcher skips the WhatsApp leg entirely.</summary>
    public bool Enabled { get; init; }

    /// <summary>
    /// Per-session bearer token issued by Wasender once the linked
    /// WhatsApp account is connected. Required when
    /// <see cref="Enabled"/> is true.
    /// </summary>
    public string? ApiKey { get; init; }

    /// <summary>
    /// API root. Defaults to the public Wasender endpoint; override
    /// only if proxying through a private edge.
    /// </summary>
    public string BaseUrl { get; init; } = "https://www.wasenderapi.com";

    /// <summary>
    /// Wasender session id from the dashboard URL (informational / logging).
    /// The per-session <see cref="ApiKey"/> selects the linked WhatsApp account.
    /// </summary>
    public string? SessionId { get; init; }

    /// <summary>
    /// Optional safety-net: when non-empty, the sender will only deliver
    /// to numbers in this list (E.164). Anything else logs a warning and
    /// returns success without touching the wire. Use this in dev so a
    /// stray test invite can't actually message a customer.
    /// </summary>
    public IReadOnlyList<string> Allowlist { get; init; } = Array.Empty<string>();

    /// <summary>
    /// E.164 number that receives new support tickets from the portal (e.g. ops phone).
    /// When set and <see cref="Enabled"/> is true, every ticket is forwarded here via WasenderAPI.
    /// </summary>
    public string? SupportInboxPhoneE164 { get; init; }
}
