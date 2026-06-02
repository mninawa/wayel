using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.BorderBox;
using Wayel.Application.Configuration;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class SuiteTrialAccessTests
{
    private static readonly UserId UserId = UserId.New();

    [Fact]
    public async Task IsEligible_when_feature_enabled_and_no_prior_activation()
    {
        var options = Options.Create(new BorderBoxOptions
        {
            TrialAccess = new BorderBoxTrialAccessOptions { Enabled = true, DurationDays = 30 },
        });
        var user = BuildCompleteUser();
        var payments = new FakeCheckoutPayments(0);

        var eligible = await SuiteTrialAccess.IsEligibleAsync(
            user,
            subscription: null,
            payments,
            options,
            new FixedClock(DateTime.UtcNow),
            CancellationToken.None);

        Assert.True(eligible);
    }

    [Fact]
    public async Task IsEligible_false_when_feature_disabled()
    {
        var options = Options.Create(new BorderBoxOptions
        {
            TrialAccess = new BorderBoxTrialAccessOptions { Enabled = false, DurationDays = 30 },
        });
        var user = BuildCompleteUser();
        var payments = new FakeCheckoutPayments(0);

        var eligible = await SuiteTrialAccess.IsEligibleAsync(
            user,
            subscription: null,
            payments,
            options,
            new FixedClock(DateTime.UtcNow),
            CancellationToken.None);

        Assert.False(eligible);
    }

    [Fact]
    public async Task IsEligible_false_after_subscription_started()
    {
        var options = Options.Create(new BorderBoxOptions
        {
            TrialAccess = new BorderBoxTrialAccessOptions { Enabled = true, DurationDays = 30 },
        });
        var user = BuildCompleteUser();
        var payments = new FakeCheckoutPayments(0);
        var sub = SuiteSubscription.Rehydrate(
            SuiteSubscriptionId.New(),
            UserId,
            SuitePlanId.New(),
            "WY-TRIAL01",
            SuiteAccessStatus.Expired,
            DateTime.UtcNow.AddDays(-40),
            DateTime.UtcNow.AddDays(-10),
            isTrial: true);

        var eligible = await SuiteTrialAccess.IsEligibleAsync(
            user,
            sub,
            payments,
            options,
            new FixedClock(DateTime.UtcNow),
            CancellationToken.None);

        Assert.False(eligible);
    }

    private static User BuildCompleteUser()
    {
        var user = User.CreateForSso("trial@weyell.test", "Trial User", "+26876000000", DateTime.UtcNow).Value;
        user.UpdateCustomerProfile(
            firstName: "Trial",
            lastName: "User",
            phone: "+26876000000",
            idNumber: "123456789",
            idDocumentType: "NationalId",
            preferredDeliveryMethod: "PUDO");
        return user;
    }

    private sealed class FakeCheckoutPayments(int completed) : ISuiteCheckoutPaymentRepository
    {
        public Task<int> CountCompletedForUserAsync(UserId userId, CancellationToken cancellationToken = default) =>
            Task.FromResult(completed);

        public Task AddAsync(SuiteCheckoutPaymentRecord record, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task<SuiteCheckoutPaymentRecord?> GetByReferenceAsync(string reference, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task MarkCompletedAsync(string reference, DateTime completedAtUtc, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task<IReadOnlyList<SuiteCheckoutPaymentRecord>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();
    }

    private sealed class FixedClock(DateTime utcNow) : Wayel.Application.Abstractions.Time.IClock
    {
        public DateTime UtcNow => utcNow;
    }
}
