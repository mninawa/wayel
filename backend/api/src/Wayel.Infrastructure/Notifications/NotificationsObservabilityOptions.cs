namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Knobs for the outbound-notification audit trail. Bound from the
/// <c>Notifications:Observability</c> configuration section.
///
/// <para>
/// The collection grows monotonically — every email and every WhatsApp
/// dispatch appends a row. Default retention is 30 days, which lines up
/// with the typical "investigate why a parent didn't receive their
/// reminder" window. Operators that need long-term retention should
/// ship rows to a downstream sink (S3 / SIEM) before they expire.
/// </para>
///
/// <para>
/// Mongo's TTL monitor enforces <see cref="Retention"/> via an index on
/// <c>SentOnUtc</c> (see <c>MongoIndexInitializer</c>). Mongo refuses to
/// mutate an index's <c>expireAfterSeconds</c> in place, so changing
/// this value triggers a one-time drop+recreate at startup.
/// </para>
///
/// <para>
/// <see cref="MaxPageSize"/> caps a single admin page. The cursor on the
/// admin endpoints is <c>(SentOnUtc, Id)</c> (newest-first) — the
/// frontend pages forward by passing the last row's pair back as
/// <c>before</c> + <c>beforeId</c>.
/// </para>
/// </summary>
public sealed class NotificationsObservabilityOptions
{
    public const string SectionName = "Notifications:Observability";

    /// <summary>How long an outbound-log row is retained before Mongo's TTL monitor reaps it.</summary>
    public TimeSpan Retention { get; init; } = TimeSpan.FromDays(30);

    /// <summary>Hard cap on a single admin-page response for outbound and suppressions.</summary>
    public int MaxPageSize { get; init; } = 200;
}
