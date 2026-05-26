using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Startup migrator that brings the suite-number pool into agreement with the
/// existing <c>suite_subscriptions</c> collection.
///
/// <para>
/// Two responsibilities:
/// <list type="bullet">
///   <item>For each populated suite number on a real subscription, ensure a
///   matching <c>Assigned</c> pool entry exists so the pool reflects reality
///   from boot zero. Idempotent — every subsequent boot is a cheap diff.</item>
///   <item>Detect duplicate suite numbers (same string assigned to multiple
///   users) and log them so ops can resolve them via the reconcile endpoint.
///   We deliberately do NOT auto-reassign here: the user's printed warehouse
///   address depends on this number, so a quiet flip on next deploy would
///   silently break their inbound parcels.</item>
/// </list>
/// </para>
/// </summary>
internal sealed class SuiteNumberPoolBackfillMigrator(
    MongoContext context,
    ISuiteNumberPoolRepository pool,
    IClock clock,
    ILogger<SuiteNumberPoolBackfillMigrator> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(SuiteNumberPoolBackfillMigrator),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var assigned = await context.SuiteSubscriptions
            .Find(x => !string.IsNullOrEmpty(x.SuiteNumber))
            .ToListAsync(cancellationToken);

        if (assigned.Count == 0)
        {
            return;
        }

        // Cache user → destination country so we can stamp the right region
        // on each pool row without an N+1 lookup.
        var userIds = assigned.Select(x => x.UserId).Distinct().ToList();
        var users = await context.Users
            .Find(u => userIds.Contains(u.Id))
            .Project(u => new { u.Id, u.DestinationCountry })
            .ToListAsync(cancellationToken);
        var regionByUser = users.ToDictionary(u => u.Id, u => SuitePlatformRegions.Normalize(u.DestinationCountry));

        var duplicates = assigned
            .GroupBy(x => x.SuiteNumber, StringComparer.Ordinal)
            .Where(g => g.Count() > 1)
            .ToList();

        if (duplicates.Count > 0)
        {
            foreach (var dup in duplicates)
            {
                logger.LogWarning(
                    "Duplicate suite number detected: {SuiteNumber} assigned to {Count} users ({UserIds}). " +
                    "Reconcile via ops endpoint to release and re-allocate the later sign-ups.",
                    dup.Key,
                    dup.Count(),
                    string.Join(", ", dup.Select(x => x.UserId.Value)));
            }
        }

        var inserts = 0;
        foreach (var sub in assigned)
        {
            // For duplicate rows, only the first user (by StartedAt or earliest
            // doc) gets registered as the pool's Assigned owner. The duplicates
            // remain "orphaned" — they'll keep functioning against the legacy
            // subscription row, but the pool view treats only one as canonical
            // until ops runs reconciliation.
            if (!regionByUser.TryGetValue(sub.UserId, out var region))
            {
                continue;
            }

            var assignedAt = sub.StartedAt ?? sub.ExpiresAt ?? clock.UtcNow;
            var inserted = await pool.EnsureAssignedAsync(
                region,
                sub.SuiteNumber!,
                sub.UserId,
                assignedAt,
                cancellationToken);

            if (inserted)
            {
                inserts++;
            }
        }

        if (inserts > 0)
        {
            logger.LogInformation(
                "Backfilled {Count} existing suite numbers into the pool (idempotent — re-runs no-op).",
                inserts);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
