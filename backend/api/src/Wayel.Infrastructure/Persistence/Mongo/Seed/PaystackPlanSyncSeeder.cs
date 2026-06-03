using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Binds active suite plans to Paystack plan codes so checkout can create subscriptions.
/// Skips plans that already have a <see cref="Wayel.Domain.SuitePlans.SuitePlan.PaystackPlanCode"/>.
/// </summary>
internal sealed class PaystackPlanSyncSeeder(
    IServiceScopeFactory scopeFactory,
    IPaystackSubscriptionBilling billing,
    ILogger<PaystackPlanSyncSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!billing.SubscriptionsEnabled)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var plans = scope.ServiceProvider.GetRequiredService<ISuitePlanRepository>();

        var allPlans = await plans.ListAllAsync(cancellationToken);
        foreach (var plan in allPlans.Where(p => p.IsActive))
        {
            if (!string.IsNullOrWhiteSpace(plan.PaystackPlanCode))
            {
                continue;
            }

            try
            {
                var amountMinor = (int)Math.Round(plan.PriceZar * 100m, MidpointRounding.AwayFromZero);
                var planCode = await billing.EnsurePlanAsync(
                    plan.Name,
                    plan.DurationMonths,
                    amountMinor,
                    cancellationToken);
                plan.BindPaystackPlan(planCode);
                await plans.UpdateAsync(plan, cancellationToken);
                logger.LogInformation(
                    "Bound suite plan {PlanName} ({DurationMonths} mo) to Paystack plan {PlanCode}.",
                    plan.Name,
                    plan.DurationMonths,
                    planCode);
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Could not sync suite plan {PlanId} to Paystack — subscription checkout may fall back to one-off charges.",
                    plan.Id.Value);
            }
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
