using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Wayel.Infrastructure.Persistence.Mongo;

public static class OutboxHealthCheckExtensions
{
    /// <summary>
    /// Registers the outbox dispatcher heartbeat health check. The check is
    /// implemented internally so callers don't depend on the concrete type;
    /// composition stays in the infrastructure layer where the heartbeat
    /// itself lives.
    /// </summary>
    public static IHealthChecksBuilder AddOutboxDispatcherHealthCheck(
        this IHealthChecksBuilder builder,
        string name = "outbox-dispatcher",
        HealthStatus? failureStatus = null,
        IEnumerable<string>? tags = null)
    {
        return builder.AddCheck<OutboxDispatcherHealthCheck>(
            name,
            failureStatus ?? HealthStatus.Unhealthy,
            tags ?? Array.Empty<string>());
    }
}
