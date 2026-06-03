using Wayel.Application.BorderBox;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class SuiteAccessEvaluatorAutoRenewTests
{
    [Fact]
    public void ExpiringSoon_with_auto_renew_mentions_scheduled_charge()
    {
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId.New(),
            SuitePlanId.New(),
            "WY-TEST01",
            SuiteAccessStatus.ExpiringSoon,
            DateTime.UtcNow.AddMonths(-2),
            DateTime.UtcNow.AddDays(5),
            autoRenewEnabled: true);

        var caps = SuiteAccessEvaluator.Evaluate(sub, DateTime.UtcNow);

        Assert.Contains("Auto-renew", caps.CustomerMessage, StringComparison.OrdinalIgnoreCase);
        Assert.False(caps.ShipOutLocked);
    }

    [Fact]
    public void Active_with_auto_renew_mentions_card_renewal()
    {
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId.New(),
            SuitePlanId.New(),
            "WY-TEST01",
            SuiteAccessStatus.Active,
            DateTime.UtcNow.AddMonths(-1),
            DateTime.UtcNow.AddMonths(1),
            autoRenewEnabled: true);

        var caps = SuiteAccessEvaluator.Evaluate(sub, DateTime.UtcNow);

        Assert.Contains("auto-renew", caps.CustomerMessage, StringComparison.OrdinalIgnoreCase);
    }
}
