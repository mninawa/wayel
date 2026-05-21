using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Wayel.Bff.Shared.Health;

/// <summary>
/// Wires up the standard <c>/health/live</c> + <c>/health/ready</c> split
/// every BFF host shares. Liveness is "is the process answering HTTP?";
/// readiness is "is the upstream API reachable?". Compose / k8s
/// <c>depends_on</c> targets the readiness endpoint so consumers don't see
/// a 502 while the BFF is up but the API is still warming.
/// </summary>
public static class BffHealthEndpoints
{
    public const string ReadyTag = "ready";

    public static IServiceCollection AddBffHealthChecks(this IServiceCollection services)
    {
        services.AddHttpClient(UpstreamApiHealthCheck.ClientName, client =>
        {
            // Tight timeout: a slow probe defeats the point of having one
            // at all. The composite startup wait in compose is what gives
            // us a generous grace window.
            client.Timeout = TimeSpan.FromSeconds(2);
        });

        services.AddHealthChecks()
            .AddCheck<UpstreamApiHealthCheck>(
                name: "upstream-api",
                failureStatus: HealthStatus.Unhealthy,
                tags: new[] { ReadyTag });

        return services;
    }

    public static IEndpointRouteBuilder MapBffHealthChecks(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health/live", new HealthCheckOptions
        {
            // Liveness ignores the registered checks so it stays trivially
            // green: any time the host is answering HTTP at all, it's
            // alive. The orchestrator only restarts on hard failure here.
            Predicate = _ => false,
        }).AllowAnonymous();

        endpoints.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains(ReadyTag),
        }).AllowAnonymous();

        // Back-compat alias so older container HEALTHCHECK directives that
        // probe `/health` keep working without rebuilds.
        endpoints.MapGet("/health", () => Results.Ok(new { status = "ok" }))
            .AllowAnonymous();

        return endpoints;
    }
}
