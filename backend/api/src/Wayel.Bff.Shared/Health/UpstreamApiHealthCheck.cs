using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Wayel.Bff.Shared.Configuration;

namespace Wayel.Bff.Shared.Health;

/// <summary>
/// Readiness probe for a BFF: confirms the upstream Wayel.Api is reachable
/// and reports ready itself. The cookie/OIDC layer is only useful once the
/// API can answer, so depending compose services should wait on
/// <c>/health/ready</c> rather than <c>/health/live</c>.
///
/// Liveness on the BFF stays cheap (always healthy as long as the host
/// process answers HTTP) so an upstream API blip doesn't trigger a
/// restart loop on the BFFs themselves.
/// </summary>
internal sealed class UpstreamApiHealthCheck(
    IHttpClientFactory httpClientFactory,
    IOptions<BffOptions> options) : IHealthCheck
{
    public const string ClientName = "wayel-bff-upstream-health";

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var bff = options.Value;
        var client = httpClientFactory.CreateClient(ClientName);

        // We hit /health/live (cheap) rather than /health/ready (transitive)
        // so a deep dependency outage on the API side doesn't cascade and
        // mark every BFF unready too. The dispatcher health check on the
        // API side will surface the real problem at /api/health/ready.
        var url = new Uri(bff.ApiBaseUri, "/health/live");

        try
        {
            using var response = await client.GetAsync(url, cancellationToken);
            return response.IsSuccessStatusCode
                ? HealthCheckResult.Healthy($"Upstream API reachable at {url}")
                : HealthCheckResult.Unhealthy(
                    $"Upstream API returned {(int)response.StatusCode} at {url}");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy(
                $"Upstream API unreachable at {url}: {ex.Message}",
                ex);
        }
    }
}
