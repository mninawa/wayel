using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class SuiteSubscriptionPaystackTests
{
    [Fact]
    public void LinkPaystackSubscription_enables_auto_renew()
    {
        var sub = SuiteSubscription.CreatePending(UserId.New(), SuitePlanId.New(), "WY-1001");
        sub.LinkPaystackSubscription("SUB_test123", "CUS_test456");

        Assert.Equal("SUB_test123", sub.PaystackSubscriptionCode);
        Assert.Equal("CUS_test456", sub.PaystackCustomerCode);
        Assert.True(sub.AutoRenewEnabled);
    }

    [Fact]
    public void DisableAutoRenew_clears_flag_but_keeps_subscription_code()
    {
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId.New(),
            SuitePlanId.New(),
            "WY-1001",
            SuiteAccessStatus.Active,
            DateTime.UtcNow.AddMonths(-1),
            DateTime.UtcNow.AddMonths(1),
            paystackSubscriptionCode: "SUB_test123",
            autoRenewEnabled: true);

        sub.DisableAutoRenew();

        Assert.False(sub.AutoRenewEnabled);
        Assert.Equal("SUB_test123", sub.PaystackSubscriptionCode);
    }

    [Fact]
    public void Renew_extends_from_current_expiry_when_still_active()
    {
        var expiresAt = DateTime.UtcNow.AddDays(10);
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId.New(),
            SuitePlanId.New(),
            "WY-1001",
            SuiteAccessStatus.Active,
            DateTime.UtcNow.AddMonths(-1),
            expiresAt);

        sub.Renew(expiresAt.AddMonths(3));

        Assert.Equal(expiresAt.AddMonths(3), sub.ExpiresAt);
        Assert.Equal(SuiteAccessStatus.Active, sub.Status);
        Assert.False(sub.IsTrial);
    }
}
