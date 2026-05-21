using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Time;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Readiness probe for the outbox dispatcher.
///
/// We treat the dispatcher as healthy when it has ticked within the last
/// <c>PollInterval × tolerance</c> window. The tolerance (default 5×)
/// absorbs cold start and the occasional GC pause without flapping the
/// readiness probe.
///
/// When the outbox is disabled (<c>Outbox:Enabled = false</c>) we report
/// <see cref="HealthStatus.Healthy"/> so test hosts that disable the
/// dispatcher don't fail their readiness gate.
/// </summary>
internal sealed class OutboxDispatcherHealthCheck(
    OutboxDispatcherHeartbeat heartbeat,
    IOptions<OutboxOptions> options,
    IClock clock) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var opts = options.Value;
        if (!opts.Enabled)
        {
            return Task.FromResult(HealthCheckResult.Healthy("outbox dispatcher is disabled"));
        }

        var lastTick = heartbeat.LastTickUtc;
        if (lastTick is null)
        {
            // The host is up but the dispatcher hasn't ticked yet. We mark
            // this as Degraded (not Unhealthy) — readiness probes commonly
            // ignore Degraded so the pod can still take traffic during the
            // first second after start.
            return Task.FromResult(HealthCheckResult.Degraded("outbox dispatcher has not ticked yet"));
        }

        var threshold = TimeSpan.FromTicks(opts.PollInterval.Ticks * 5);
        // Floor the threshold at 10s so very small poll intervals (e.g. tests
        // running at 50ms) don't produce a window narrower than a typical GC.
        if (threshold < TimeSpan.FromSeconds(10))
        {
            threshold = TimeSpan.FromSeconds(10);
        }

        var age = clock.UtcNow - lastTick.Value;
        if (age <= threshold)
        {
            return Task.FromResult(HealthCheckResult.Healthy(
                $"outbox dispatcher ticked {age.TotalSeconds:F1}s ago",
                data: BuildData(lastTick.Value, age, threshold)));
        }

        return Task.FromResult(HealthCheckResult.Unhealthy(
            $"outbox dispatcher has not ticked for {age.TotalSeconds:F0}s (threshold {threshold.TotalSeconds:F0}s)",
            data: BuildData(lastTick.Value, age, threshold)));
    }

    private static Dictionary<string, object> BuildData(DateTime lastTick, TimeSpan age, TimeSpan threshold) =>
        new()
        {
            ["lastTickUtc"] = lastTick,
            ["ageSeconds"] = age.TotalSeconds,
            ["thresholdSeconds"] = threshold.TotalSeconds,
        };
}
