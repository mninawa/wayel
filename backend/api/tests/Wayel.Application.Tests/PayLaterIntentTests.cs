using FluentAssertions;
using Wayel.Domain.Onboarding;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

/// <summary>
/// Behavioural contract for the <see cref="PayLaterIntent"/> aggregate.
///
/// The intent feeds two things:
///   1. Customer routing — while the intent is active the SPA sends them to
///      <c>/welcome</c> instead of the plan picker. So <see cref="PayLaterIntent.IsActive"/>
///      MUST flip false the moment a payment is recorded.
///   2. The ops "Onboarding funnel" stats — <c>CreatedAtUtc</c> can never move
///      and <c>ResolvedAtUtc</c> can never be overwritten, otherwise the
///      conversion rate / time-to-pay numbers lie.
/// </summary>
public sealed class PayLaterIntentTests
{
    private static readonly UserId User = new(Guid.NewGuid());

    [Fact]
    public void Create_starts_active_with_matching_created_and_last_seen()
    {
        var now = new DateTime(2026, 5, 26, 10, 0, 0, DateTimeKind.Utc);

        var intent = PayLaterIntent.Create(User, now);

        intent.IsActive.Should().BeTrue();
        intent.UserId.Should().Be(User);
        intent.CreatedAtUtc.Should().Be(now);
        intent.LastSeenAtUtc.Should().Be(now, "a freshly-created intent has never been touched");
        intent.ResolvedAtUtc.Should().BeNull();
    }

    [Fact]
    public void Create_snapshots_the_plan_label_when_supplied()
    {
        var planId = new SuitePlanId(Guid.NewGuid());

        var intent = PayLaterIntent.Create(User, DateTime.UtcNow, planId, "  Quarterly  ");

        intent.PlanAtSignal.Should().Be(planId);
        intent.PlanAtSignalLabel.Should().Be("Quarterly", "labels are trimmed for clean ops display");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Create_normalises_blank_plan_labels_to_null(string? blank)
    {
        var intent = PayLaterIntent.Create(User, DateTime.UtcNow, planLabel: blank);

        intent.PlanAtSignalLabel.Should().BeNull();
    }

    [Fact]
    public void Touch_bumps_last_seen_when_clock_moved_forward()
    {
        var created = new DateTime(2026, 5, 26, 10, 0, 0, DateTimeKind.Utc);
        var later = created.AddHours(3);
        var intent = PayLaterIntent.Create(User, created);

        intent.Touch(later);

        intent.LastSeenAtUtc.Should().Be(later);
        intent.CreatedAtUtc.Should().Be(created, "Touch must never rewrite the create timestamp");
    }

    [Fact]
    public void Touch_does_not_move_last_seen_backwards_when_called_with_stale_clock()
    {
        // Defensive: a NTP-skewed instance must not rewind the stats.
        var created = new DateTime(2026, 5, 26, 10, 0, 0, DateTimeKind.Utc);
        var intent = PayLaterIntent.Create(User, created);

        intent.Touch(created.AddMinutes(-1));

        intent.LastSeenAtUtc.Should().Be(created);
    }

    [Fact]
    public void Touch_can_update_the_plan_snapshot_when_a_new_plan_is_supplied()
    {
        var intent = PayLaterIntent.Create(User, DateTime.UtcNow);
        var newPlan = new SuitePlanId(Guid.NewGuid());

        intent.Touch(DateTime.UtcNow, newPlan, "Annual");

        intent.PlanAtSignal.Should().Be(newPlan);
        intent.PlanAtSignalLabel.Should().Be("Annual");
    }

    [Fact]
    public void Resolve_flips_active_false_and_stamps_paid_timestamp()
    {
        var paidAt = new DateTime(2026, 5, 27, 12, 30, 0, DateTimeKind.Utc);
        var intent = PayLaterIntent.Create(User, paidAt.AddHours(-26));

        intent.Resolve(paidAt);

        intent.IsActive.Should().BeFalse();
        intent.ResolvedAtUtc.Should().Be(paidAt);
    }

    [Fact]
    public void Resolve_is_first_write_wins_to_protect_time_to_pay_metric()
    {
        // The webhook + the customer's post-redirect call can both land at
        // roughly the same moment; only the first one counts.
        var first = new DateTime(2026, 5, 27, 12, 30, 0, DateTimeKind.Utc);
        var second = first.AddMinutes(5);
        var intent = PayLaterIntent.Create(User, first.AddHours(-26));

        intent.Resolve(first);
        intent.Resolve(second);

        intent.ResolvedAtUtc.Should().Be(first,
            "first-write-wins keeps the analytics consistent with the first real payment ack");
    }
}
