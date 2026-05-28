using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Parcels;

namespace Wayel.Infrastructure.Parcels;

/// <summary>
/// Polls receiving exceptions and WhatsApps the ops support inbox for each new open item.
/// </summary>
internal sealed class OpsExceptionSupportAlertHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<OpsExceptionSupportAlertOptions> options,
    ILogger<OpsExceptionSupportAlertHostedService> logger) : BackgroundService
{
    private readonly OpsExceptionSupportAlertOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            logger.LogInformation("Ops exception support WhatsApp alerts are disabled.");
            return;
        }

        logger.LogInformation(
            "Ops exception support alerts starting (interval = {Interval}, max per run = {Max})",
            _options.PollInterval,
            _options.MaxAlertsPerRun);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Ops exception support alert tick failed.");
            }

            try
            {
                await Task.Delay(_options.PollInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task ProcessOnceAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        var result = await mediator.Send(new ProcessOpsExceptionSupportAlertsCommand(), cancellationToken);
        if (result.IsFailure)
        {
            logger.LogWarning(
                "Ops exception support alerts returned {Code}: {Message}",
                result.Error.Code,
                result.Error.Message);
            return;
        }

        var value = result.Value;
        if (value.NotifiedCount > 0)
        {
            logger.LogInformation(
                "Ops exception support alerts sent {Notified} WhatsApp message(s) ({Open} open, {Skipped} already notified).",
                value.NotifiedCount,
                value.OpenExceptionCount,
                value.SkippedAlreadyNotified);
        }
    }
}
