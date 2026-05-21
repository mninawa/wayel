namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Configuration knobs for the durable audit log. Defaults favour
/// "remember enough to investigate, forget enough to stay healthy" —
/// 180 days lines up with most internal compliance asks while staying
/// well under the size where Mongo TTL pruning becomes expensive.
/// </summary>
public sealed class AuditOptions
{
    public const string SectionName = "Audit";

    /// <summary>
    /// How long audit entries are kept before Mongo's TTL monitor reaps
    /// them. Operators that need long-term retention should ship to a
    /// separate sink (S3 / SIEM) before hitting this window.
    /// </summary>
    public TimeSpan Retention { get; init; } = TimeSpan.FromDays(180);
}
