using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Binds active suite plans to Paystack plan codes by matching amount + billing interval.
/// </summary>
internal sealed class PaystackPlanSyncSeeder(
    IServiceScopeFactory scopeFactory,
    IPaystackSubscriptionBilling billing,
    ILogger<PaystackPlanSyncSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var plans = scope.ServiceProvider.GetRequiredService<ISuitePlanRepository>();
        await SuitePlanPaystackReconciler.ReconcileActivePlansAsync(plans, billing, logger, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
