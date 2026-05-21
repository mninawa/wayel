namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Tuning for the outbox archive hosted service. Independent from
/// <c>OutboxOptions</c> so a host can keep the dispatcher running while
/// disabling archival (e.g. tests) and so production deployments can run
/// the archive job on its own cadence.
/// </summary>
public sealed class OutboxArchiveOptions
{
    public const string SectionName = "Outbox:Archive";

    /// <summary>
    /// Master switch for the archive job. Defaults to <c>false</c> so the
    /// existing TTL-only behaviour is preserved and tests don't have to
    /// stub a sink. Production deployments that want long-term retention
    /// flip this to <c>true</c> *and* register a real sink.
    /// </summary>
    public bool Enabled { get; init; }

    /// <summary>
    /// How often the archive job wakes up to scan for terminal rows. Should
    /// be substantially slower than the dispatcher poll: archiving is
    /// retention plumbing, not a hot path.
    /// </summary>
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Only terminal rows older than this window are archived. Set close
    /// to (but smaller than) <c>OutboxOptions.RetentionAfterTerminal</c>
    /// so we ship rows just before TTL eviction would have removed them.
    /// </summary>
    public TimeSpan ArchiveAfter { get; init; } = TimeSpan.FromDays(6);

    /// <summary>
    /// Cap on rows shipped per poll. Keeps a single archive tick from
    /// monopolising the database connection if a backlog accumulates.
    /// </summary>
    public int BatchSize { get; init; } = 200;

    /// <summary>
    /// Filesystem destination for the bundled
    /// <see cref="FilesystemOutboxArchiveSink"/>. Ignored when a different
    /// sink is composed in. Created on first write if it doesn't exist.
    /// </summary>
    public string? RootPath { get; init; }
}
