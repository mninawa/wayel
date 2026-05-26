using FluentAssertions;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

/// <summary>
/// Behavioural contract for <see cref="SuiteNumberPoolEntry"/>.
///
/// The pool is the safety mechanism that prevents two users sharing a suite
/// number, so these tests pin the invariants that back that promise:
/// status transitions are one-way (Available → Assigned → Available) and the
/// claim/release methods refuse silent re-use.
/// </summary>
public sealed class SuiteNumberPoolEntryTests
{
    private static readonly UserId Alice = new(Guid.NewGuid());
    private static readonly UserId Bob = new(Guid.NewGuid());

    [Fact]
    public void CreateAvailable_starts_available_with_no_assignee()
    {
        var now = new DateTime(2026, 5, 26, 10, 0, 0, DateTimeKind.Utc);

        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", now);

        entry.IsAvailable.Should().BeTrue();
        entry.IsAssigned.Should().BeFalse();
        entry.AssignedToUserId.Should().BeNull();
        entry.RegionCode.Should().Be("SZ");
        entry.Number.Should().Be("WY-000001");
        entry.CreatedAtUtc.Should().Be(now);
    }

    [Fact]
    public void CreateAvailable_normalises_region_to_upper_and_trims_number()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("  sz ", "  WY-000001  ", DateTime.UtcNow);

        entry.RegionCode.Should().Be("SZ");
        entry.Number.Should().Be("WY-000001");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void CreateAvailable_rejects_blank_number(string? blank)
    {
        var act = () => SuiteNumberPoolEntry.CreateAvailable("SZ", blank!, DateTime.UtcNow);

        act.Should().Throw<ArgumentException>().WithMessage("Suite number is required.*");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void CreateAvailable_rejects_blank_region(string? blank)
    {
        var act = () => SuiteNumberPoolEntry.CreateAvailable(blank!, "WY-000001", DateTime.UtcNow);

        act.Should().Throw<ArgumentException>().WithMessage("Region code is required.*");
    }

    [Fact]
    public void CreateAlreadyAssigned_lands_in_assigned_state_for_backfill()
    {
        var assignedAt = new DateTime(2026, 5, 26, 10, 0, 0, DateTimeKind.Utc);

        var entry = SuiteNumberPoolEntry.CreateAlreadyAssigned("SZ", "WY-000001", Alice, assignedAt);

        entry.IsAssigned.Should().BeTrue();
        entry.AssignedToUserId.Should().Be(Alice);
        entry.AssignedAtUtc.Should().Be(assignedAt);
        entry.CreatedAtUtc.Should().Be(assignedAt, "backfill rows have no created-before-assigned gap");
    }

    [Fact]
    public void Claim_transitions_an_available_entry_to_assigned()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", DateTime.UtcNow);
        var claimedAt = DateTime.UtcNow.AddSeconds(5);

        entry.Claim(Alice, claimedAt);

        entry.IsAssigned.Should().BeTrue();
        entry.AssignedToUserId.Should().Be(Alice);
        entry.AssignedAtUtc.Should().Be(claimedAt);
        entry.ReleasedAtUtc.Should().BeNull("a fresh claim wipes any prior release marker");
    }

    [Fact]
    public void Claim_refuses_double_assignment_so_two_users_cannot_share_a_number()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", DateTime.UtcNow);
        entry.Claim(Alice, DateTime.UtcNow);

        var act = () => entry.Claim(Bob, DateTime.UtcNow);

        act.Should().Throw<InvalidOperationException>().WithMessage("*not available*");
    }

    [Fact]
    public void Release_flips_back_to_available_and_stamps_the_release_time()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", DateTime.UtcNow);
        entry.Claim(Alice, DateTime.UtcNow);
        var releasedAt = DateTime.UtcNow.AddDays(30);

        entry.Release(releasedAt);

        entry.IsAvailable.Should().BeTrue();
        entry.AssignedToUserId.Should().BeNull();
        entry.AssignedAtUtc.Should().BeNull();
        entry.ReleasedAtUtc.Should().Be(releasedAt);
    }

    [Fact]
    public void Release_is_idempotent_for_an_already_available_entry()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", DateTime.UtcNow);

        var act = () => entry.Release(DateTime.UtcNow);

        act.Should().NotThrow();
        entry.IsAvailable.Should().BeTrue();
    }

    [Fact]
    public void Reclaim_after_release_is_allowed_so_recycled_numbers_can_flow_again()
    {
        var entry = SuiteNumberPoolEntry.CreateAvailable("SZ", "WY-000001", DateTime.UtcNow);
        entry.Claim(Alice, DateTime.UtcNow);
        entry.Release(DateTime.UtcNow.AddDays(30));

        entry.Claim(Bob, DateTime.UtcNow.AddDays(31));

        entry.IsAssigned.Should().BeTrue();
        entry.AssignedToUserId.Should().Be(Bob);
    }
}
