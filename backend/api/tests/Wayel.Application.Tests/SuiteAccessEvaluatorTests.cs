using Wayel.Application.BorderBox;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class SuiteAccessEvaluatorTests
{
    [Fact]
    public void Expired_subscription_locks_ship_out_but_allows_receive()
    {
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId.New(),
            SuitePlanId.New(),
            "WY-TEST01",
            SuiteAccessStatus.Expired,
            DateTime.UtcNow.AddMonths(-2),
            DateTime.UtcNow.AddDays(-1));

        var caps = SuiteAccessEvaluator.Evaluate(sub, DateTime.UtcNow);

        Assert.True(caps.CanReceiveParcels);
        Assert.True(caps.CanUploadInvoices);
        Assert.False(caps.CanShipOut);
        Assert.True(caps.ShipOutLocked);
    }
}
