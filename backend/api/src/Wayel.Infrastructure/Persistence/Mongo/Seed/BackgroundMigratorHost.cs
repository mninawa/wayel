using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Shared helper that lets idempotent one-shot migrators run off the
/// API listener's critical path on cold-start.
///
/// Why: every <see cref="Microsoft.Extensions.Hosting.IHostedService"/>
/// runs sequentially during <c>Host.StartAsync</c> and Kestrel's hosted
/// service is the last in that chain — so a slow seeder/migrator blocks
/// the listener from opening, which on Render's free tier turns a 4s
/// cold-start into a 30s+ "API is taking forever" experience.
///
/// Migrators that are safe to run *after* the listener opens (idempotent,
/// not required to satisfy the first request) should call
/// <see cref="QueueAsync"/> from their <c>StartAsync</c>. The work runs
/// on a background task with structured logging for failures; the
/// hosted service's <c>StartAsync</c> returns immediately so the host
/// can move on to the next service (and ultimately Kestrel).
///
/// What this is NOT for: data the very first request depends on (e.g.
/// MongoDB indexes, the platform pricing config, suite plans). Those
/// stay as blocking <c>IHostedService</c>s on the critical path.
/// </summary>
internal static class BackgroundMigratorHost
{
    /// <summary>
    /// Queue <paramref name="body"/> to run in the background and return
    /// immediately. The migrator's <c>IHostedService.StartAsync</c>
    /// should <c>return BackgroundMigratorHost.QueueAsync(...)</c>.
    /// </summary>
    /// <param name="logger">Migrator's own typed logger — used for
    /// structured failure / duration logging.</param>
    /// <param name="name">Migrator name (typically
    /// <c>nameof(MyMigrator)</c>) for log correlation.</param>
    /// <param name="body">The actual migration work. Receives the
    /// host's cancellation token so a graceful shutdown still drops
    /// any in-flight Mongo round-trips.</param>
    /// <param name="hostCancellationToken">The token passed to
    /// <c>StartAsync</c> by the host.</param>
    public static Task QueueAsync(
        ILogger logger,
        string name,
        Func<CancellationToken, Task> body,
        CancellationToken hostCancellationToken)
    {
        _ = Task.Run(async () =>
        {
            var sw = Stopwatch.StartNew();
            try
            {
                await body(hostCancellationToken).ConfigureAwait(false);
                if (sw.ElapsedMilliseconds > 100)
                {
                    logger.LogInformation(
                        "{Migrator} finished in {ElapsedMs}ms",
                        name, sw.ElapsedMilliseconds);
                }
            }
            catch (OperationCanceledException) when (hostCancellationToken.IsCancellationRequested)
            {
                // Normal shutdown — host is tearing down, drop the work.
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "{Migrator} failed in background after {ElapsedMs}ms",
                    name, sw.ElapsedMilliseconds);
            }
        }, hostCancellationToken);

        return Task.CompletedTask;
    }
}
