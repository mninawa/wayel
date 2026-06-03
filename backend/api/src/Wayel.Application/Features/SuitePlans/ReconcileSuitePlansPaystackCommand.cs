using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlans;

public sealed record ReconcileSuitePlansPaystackCommand : ICommand<ReconcileSuitePlansPaystackResult>;

public sealed record ReconcileSuitePlansPaystackResult(int PlansUpdated);

internal sealed class ReconcileSuitePlansPaystackCommandHandler(
    ISuitePlanRepository plans,
    IPaystackSubscriptionBilling billing) : ICommandHandler<ReconcileSuitePlansPaystackCommand, ReconcileSuitePlansPaystackResult>
{
    public async Task<Result<ReconcileSuitePlansPaystackResult>> Handle(
        ReconcileSuitePlansPaystackCommand request,
        CancellationToken cancellationToken)
    {
        if (!billing.SubscriptionsEnabled)
        {
            return Error.Validation(
                "paystack.subscriptions_disabled",
                "Paystack subscriptions are not enabled.");
        }

        var allPlans = await plans.ListAllAsync(cancellationToken);
        var updated = 0;

        foreach (var plan in allPlans.Where(p => p.IsActive))
        {
            var amountMinor = (int)Math.Round(plan.PriceZar * 100m, MidpointRounding.AwayFromZero);
            var resolved = await billing.ResolvePlanCodeAsync(
                plan.DurationMonths,
                amountMinor,
                plan.Name,
                plan.PaystackPlanCode,
                cancellationToken);

            string planCode;
            if (!string.IsNullOrWhiteSpace(resolved))
            {
                planCode = resolved;
            }
            else
            {
                try
                {
                    planCode = await billing.EnsurePlanAsync(
                        plan.Name,
                        plan.DurationMonths,
                        amountMinor,
                        cancellationToken);
                }
                catch (InvalidOperationException ex)
                {
                    return Error.Validation("paystack.plan_sync_failed", ex.Message);
                }
            }

            if (string.Equals(plan.PaystackPlanCode, planCode, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            plan.BindPaystackPlan(planCode);
            await plans.UpdateAsync(plan, cancellationToken);
            updated++;
        }

        return new ReconcileSuitePlansPaystackResult(updated);
    }
}
