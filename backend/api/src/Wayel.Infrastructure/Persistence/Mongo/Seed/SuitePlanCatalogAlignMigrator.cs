using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuitePlans;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Renames legacy generic suite plan titles (e.g. "Monthly", "Quarterly Suite Access")
/// to the Paystack-aligned catalogue names so reconciliation can bind the correct PLN codes.
/// Idempotent — only touches plans whose names still look generic.
/// </summary>
internal sealed class SuitePlanCatalogAlignMigrator(
    ISuitePlanRepository plans,
    ILogger<SuitePlanCatalogAlignMigrator> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var all = await plans.ListAllAsync(cancellationToken);
        var updated = 0;

        foreach (var plan in all.Where(p => p.IsActive))
        {
            var canonical = CanonicalName(plan);
            if (canonical is null || string.Equals(plan.Name, canonical, StringComparison.Ordinal))
            {
                continue;
            }

            plan.Update(canonical, plan.DurationMonths, plan.PriceZar, plan.IsRecommended);
            plan.ClearPaystackPlanBinding();
            await plans.UpdateAsync(plan, cancellationToken);
            updated++;
            logger.LogInformation(
                "Renamed suite plan {PlanId} to {PlanName} for Paystack alignment.",
                plan.Id.Value,
                canonical);
        }

        if (updated > 0)
        {
            logger.LogInformation("Aligned {Count} suite plan name(s) with Paystack catalogue.", updated);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static string? CanonicalName(SuitePlan plan) =>
        plan.DurationMonths switch
        {
            1 when IsGenericName(plan.Name) => "Starter Pack",
            3 when IsGenericName(plan.Name) => "Boost Plan",
            _ => null,
        };

    private static bool IsGenericName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var trimmed = name.Trim();
        if (trimmed.Equals("Monthly", StringComparison.OrdinalIgnoreCase)
            || trimmed.Equals("Quarterly", StringComparison.OrdinalIgnoreCase)
            || trimmed.Equals("Monthly Plan", StringComparison.OrdinalIgnoreCase)
            || trimmed.Equals("Quarterly Plan", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return trimmed.Contains("suite access", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("monthly suite", StringComparison.OrdinalIgnoreCase)
            || trimmed.Contains("quarterly suite", StringComparison.OrdinalIgnoreCase);
    }
}
