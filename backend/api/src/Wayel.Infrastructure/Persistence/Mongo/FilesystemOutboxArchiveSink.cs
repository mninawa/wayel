using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Filesystem-backed <see cref="IOutboxArchiveSink"/> intended for
/// development, on-call inspection, and integration tests. Writes one
/// JSON-Lines file per UTC day under <see cref="OutboxArchiveOptions.RootPath"/>:
///
///     /var/lib/wayel/outbox-archive/2026-04-17.jsonl
///
/// Each line is a self-contained JSON document with the full
/// <see cref="OutboxMessage"/> shape, so an operator can grep / replay
/// without a live database.
///
/// Why JSON-Lines? It's append-only (a fsync-and-flush is enough for
/// crash safety on a single host) and trivially streamable by everything
/// from <c>jq</c> to log shippers. It is *not* suitable for production at
/// scale — a real deployment swaps in an S3 / Azure Blob / Datadog
/// implementation.
///
/// Concurrency: writes are serialised by a per-instance lock. The sink is
/// registered as a singleton, so a single process won't interleave lines.
/// Multi-host deployments need a real, shared sink anyway.
/// </summary>
internal sealed class FilesystemOutboxArchiveSink(
    ILogger<FilesystemOutboxArchiveSink> logger,
    IOptions<OutboxArchiveOptions> options) : IOutboxArchiveSink, IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    private readonly SemaphoreSlim _writeGate = new(1, 1);

    public void Dispose() => _writeGate.Dispose();

    public async Task ArchiveAsync(
        IReadOnlyList<OutboxMessage> messages,
        CancellationToken cancellationToken = default)
    {
        if (messages.Count == 0) return;

        var rootPath = options.Value.RootPath;
        if (string.IsNullOrWhiteSpace(rootPath))
        {
            // Defensive: composition should refuse to register the sink
            // without a path, but be friendly if a config flip leaves it
            // empty in production.
            logger.LogWarning("FilesystemOutboxArchiveSink invoked without a configured RootPath");
            return;
        }

        Directory.CreateDirectory(rootPath);

        // Group by UTC day so the file name is stable regardless of when
        // the dispatcher actually shipped the row.
        var groups = messages.GroupBy(m => DateOnly.FromDateTime(m.OccurredOnUtc.ToUniversalTime()));

        await _writeGate.WaitAsync(cancellationToken);
        try
        {
            foreach (var group in groups)
            {
                var fileName = $"{group.Key:yyyy-MM-dd}.jsonl";
                var fullPath = Path.Combine(rootPath, fileName);

                await using var stream = new FileStream(
                    fullPath,
                    FileMode.Append,
                    FileAccess.Write,
                    FileShare.Read,
                    bufferSize: 4096,
                    useAsync: true);
                await using var writer = new StreamWriter(stream);

                foreach (var message in group)
                {
                    var json = JsonSerializer.Serialize(message, JsonOptions);
                    await writer.WriteLineAsync(json.AsMemory(), cancellationToken);
                }

                await writer.FlushAsync(cancellationToken);
            }
        }
        finally
        {
            _writeGate.Release();
        }

        logger.LogInformation(
            "Archived {Count} terminal outbox rows to {RootPath}",
            messages.Count,
            rootPath);
    }
}
