using System.Diagnostics;
using MediatR;
using Microsoft.Extensions.Logging;

namespace Wayel.Application.Behaviors;

/// <summary>
/// Emits a Warning log when a request exceeds <see cref="LongRunningThresholdMs"/>,
/// so the SRE dashboards can flag slow CQRS requests independently of overall request time.
/// </summary>
public sealed class PerformanceBehavior<TRequest, TResponse>(ILogger<PerformanceBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private const int LongRunningThresholdMs = 500;

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var response = await next();
        stopwatch.Stop();

        if (stopwatch.ElapsedMilliseconds > LongRunningThresholdMs)
        {
            logger.LogWarning(
                "Long-running request: {RequestName} took {ElapsedMs} ms",
                typeof(TRequest).Name,
                stopwatch.ElapsedMilliseconds);
        }

        return response;
    }
}
