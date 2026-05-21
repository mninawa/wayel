using System.Diagnostics;
using MediatR;
using Microsoft.Extensions.Logging;
using Wayel.Domain.Common;

namespace Wayel.Application.Behaviors;

/// <summary>
/// Wraps every request with a structured log scope including request name, type, and elapsed ms.
/// Errors are logged at Warning (Result.Failure) or Error (exception) so log dashboards can split them.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse>(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;
        var stopwatch = Stopwatch.StartNew();

        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["RequestName"] = requestName,
        });

        logger.LogInformation("Handling {RequestName}", requestName);

        try
        {
            var response = await next();
            stopwatch.Stop();

            if (response is Result { IsFailure: true } result)
            {
                logger.LogWarning(
                    "Request {RequestName} failed with {ErrorCode}: {ErrorMessage} ({ElapsedMs} ms)",
                    requestName,
                    result.Error.Code,
                    result.Error.Message,
                    stopwatch.ElapsedMilliseconds);
            }
            else
            {
                logger.LogInformation(
                    "Handled {RequestName} in {ElapsedMs} ms",
                    requestName,
                    stopwatch.ElapsedMilliseconds);
            }

            return response;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            logger.LogError(
                ex,
                "Unhandled exception in {RequestName} after {ElapsedMs} ms",
                requestName,
                stopwatch.ElapsedMilliseconds);
            throw;
        }
    }
}
