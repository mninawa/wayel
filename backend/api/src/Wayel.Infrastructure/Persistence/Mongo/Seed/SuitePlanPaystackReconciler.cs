using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

internal static class SuitePlanPaystackReconciler
{
    public static async Task<int> ReconcileActivePlansAsync(
        ISuitePlanRepository plans,
        IPaystackSubscriptionBilling billing,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        if (!billing.SubscriptionsEnabled)
        {
            return 0;
        }

        var updated = 0;
        var allPlans = await plans.ListAllAsync(cancellationToken);
        foreach (var plan in allPlans.Where(p => p.IsActive))
        {
            try
            {
                var amountMinor = (int)Math.Round(plan.PriceZar * 100m, MidpointRounding.AwayFromZero);
                var resolved = await billing.ResolvePlanCodeAsync(
                    plan.DurationMonths,
                    amountMinor,
                    plan.Name,
                    plan.PaystackPlanCode,
                    cancellationToken);

                var planCode = !string.IsNullOrWhiteSpace(resolved)
                    ? resolved
                    : await billing.EnsurePlanAsync(plan.Name, plan.DurationMonths, amountMinor, cancellationToken);

                if (string.Equals(plan.PaystackPlanCode, planCode, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                plan.BindPaystackPlan(planCode);
                await plans.UpdateAsync(plan, cancellationToken);
                updated++;
                logger.LogInformation(
                    "Bound suite plan {PlanName} to Paystack plan {PlanCode}.",
                    plan.Name,
                    planCode);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not reconcile suite plan {PlanId} with Paystack.", plan.Id.Value);
            }
        }

        return updated;
    }
}
