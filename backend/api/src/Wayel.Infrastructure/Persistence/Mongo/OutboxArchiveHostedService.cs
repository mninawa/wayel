using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Time;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Background loop that hand-offs terminal outbox rows to the registered
/// <see cref="IOutboxArchiveSink"/> before Mongo's TTL evicts them.
///
/// Lifecycle per tick:
///   1. Compute <c>cutoff = now - OutboxArchiveOptions.ArchiveAfter</c>.
///   2. Pull a bounded batch of terminal, unarchived rows older than cutoff.
///   3. Hand the batch to the sink.
///   4. On success, stamp <c>ArchivedOnUtc</c> so subsequent ticks skip them.
///
/// Errors short-circuit the tick (no archive flag is set) so the next loop
/// retries the same rows. The sink contract is at-least-once; the row's
/// <c>Id</c> is the natural dedupe key for downstream consumers.
///
/// Concurrency across hosts: the archive flag is set via a single update,
/// so two hosts may briefly double-ship the same batch. That's acceptable
/// — the sink is documented as at-least-once, and the throughput here is
/// minutes-cadence rather than per-second.
/// </summary>
internal sealed class OutboxArchiveHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<OutboxArchiveOptions> options,
    ILogger<OutboxArchiveHostedService> logger)
    : BackgroundService
{
    private readonly OutboxArchiveOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            logger.LogInformation("Outbox archive job is disabled — terminal rows will TTL-evict only");
            return;
        }

        logger.LogInformation(
            "Outbox archive job starting (poll interval = {PollInterval}, archive-after = {ArchiveAfter}, batch = {BatchSize})",
            _options.PollInterval,
            _options.ArchiveAfter,
            _options.BatchSize);

        // Slight initial delay so we don't race the dispatcher / index
        // initialiser at process start. Three seconds is enough for the
        // host to settle and not so long it masks a misconfigured archive
        // job in dev.
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ArchiveBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Outbox archive tick failed; will retry on the next interval");
            }

            try
            {
                await Task.Delay(_options.PollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ArchiveBatchAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IOutboxStore>();
        var sink = scope.ServiceProvider.GetRequiredService<IOutboxArchiveSink>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();

        await ArchiveBatchAsync(store, sink, clock, cancellationToken);
    }

    /// <summary>
    /// Tick body extracted as an internal entry point so unit tests can drive
    /// it with mocks without standing up an <see cref="IServiceScopeFactory"/>.
    /// </summary>
    internal async Task ArchiveBatchAsync(
        IOutboxStore store,
        IOutboxArchiveSink sink,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var cutoff = clock.UtcNow - _options.ArchiveAfter;
        var batch = await store.GetTerminalUnarchivedAsync(cutoff, _options.BatchSize, cancellationToken);
        if (batch.Count == 0) return;

        // Sink first, mark second. If the sink throws we leave the rows
        // unflagged so the next tick replays them.
        await sink.ArchiveAsync(batch, cancellationToken);

        var ids = batch.Select(m => m.Id).ToList();
        await store.MarkArchivedAsync(ids, clock.UtcNow, cancellationToken);

        logger.LogInformation(
            "Archived {Count} terminal outbox rows (cutoff = {Cutoff:o})",
            batch.Count,
            cutoff);
    }
}
