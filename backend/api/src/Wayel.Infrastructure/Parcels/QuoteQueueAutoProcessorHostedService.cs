using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Parcels;

namespace Wayel.Infrastructure.Parcels;

/// <summary>
/// Promotes ops-ready parcels to the customer quote queue and notifies customers via WhatsApp.
/// </summary>
internal sealed class QuoteQueueAutoProcessorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<QuoteQueueAutoProcessorOptions> options,
    ILogger<QuoteQueueAutoProcessorHostedService> logger) : BackgroundService
{
    private readonly QuoteQueueAutoProcessorOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            logger.LogInformation("Quote queue auto-processor is disabled.");
            return;
        }

        logger.LogInformation(
            "Quote queue auto-processor starting (interval = {Interval}, max per run = {Max})",
            _options.PollInterval,
            _options.MaxParcelsPerRun);

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
                logger.LogError(ex, "Quote queue auto-processor tick failed.");
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
        var result = await mediator.Send(new ProcessAutoQuoteQueueCommand(), cancellationToken);
        if (result.IsFailure)
        {
            logger.LogWarning(
                "Quote queue auto-processor returned error {Code}: {Message}",
                result.Error.Code,
                result.Error.Message);
            return;
        }

        if (result.Value.ProcessedCount > 0)
        {
            logger.LogInformation(
                "Quote queue auto-processor promoted {Count} parcel(s).",
                result.Value.ProcessedCount);
        }
    }
}
