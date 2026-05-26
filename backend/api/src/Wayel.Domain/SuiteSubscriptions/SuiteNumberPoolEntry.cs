using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.SuiteSubscriptions;

/// <summary>
/// One row in the suite-number pool. Each (region, number) pair is uniquely
/// represented here regardless of whether it's been handed out yet.
///
/// <para>
/// The pool is the single source of truth for suite-number uniqueness:
/// the allocator atomically flips an <see cref="SuiteNumberPoolStatus.Available"/>
/// row to <see cref="SuiteNumberPoolStatus.Assigned"/> via a single
/// <c>findOneAndUpdate</c>, so two parallel sign-ups can't collide on the same
/// number even under heavy concurrency. Before the pool existed, suite numbers
/// were derived from the first hex chars of a UUID v7 user id, which made
/// collisions guaranteed for users who signed up in the same time window.
/// </para>
/// </summary>
public sealed class SuiteNumberPoolEntry : AggregateRoot<SuiteNumberPoolEntryId>
{
    private SuiteNumberPoolEntry(
        SuiteNumberPoolEntryId id,
        string regionCode,
        string number,
        SuiteNumberPoolStatus status,
        UserId? assignedToUserId,
        DateTime createdAtUtc,
        DateTime? assignedAtUtc,
        DateTime? releasedAtUtc)
        : base(id)
    {
        RegionCode = regionCode;
        Number = number;
        Status = status;
        AssignedToUserId = assignedToUserId;
        CreatedAtUtc = createdAtUtc;
        AssignedAtUtc = assignedAtUtc;
        ReleasedAtUtc = releasedAtUtc;
    }

    public string RegionCode { get; }
    public string Number { get; }
    public SuiteNumberPoolStatus Status { get; private set; }
    public UserId? AssignedToUserId { get; private set; }
    public DateTime CreatedAtUtc { get; }
    public DateTime? AssignedAtUtc { get; private set; }
    public DateTime? ReleasedAtUtc { get; private set; }

    public bool IsAvailable => Status == SuiteNumberPoolStatus.Available;
    public bool IsAssigned => Status == SuiteNumberPoolStatus.Assigned;

    /// <summary>A brand-new, never-handed-out pool entry waiting in the queue.</summary>
    public static SuiteNumberPoolEntry CreateAvailable(string regionCode, string number, DateTime nowUtc)
    {
        Validate(regionCode, number);
        return new SuiteNumberPoolEntry(
            SuiteNumberPoolEntryId.New(),
            regionCode.Trim().ToUpperInvariant(),
            number.Trim(),
            SuiteNumberPoolStatus.Available,
            assignedToUserId: null,
            createdAtUtc: nowUtc,
            assignedAtUtc: null,
            releasedAtUtc: null);
    }

    /// <summary>
    /// Used by the backfill migration to register a suite number that's already
    /// in use by a real subscription, so the pool reflects reality from day one.
    /// </summary>
    public static SuiteNumberPoolEntry CreateAlreadyAssigned(
        string regionCode,
        string number,
        UserId userId,
        DateTime assignedAtUtc) =>
        new(
            SuiteNumberPoolEntryId.New(),
            regionCode.Trim().ToUpperInvariant(),
            number.Trim(),
            SuiteNumberPoolStatus.Assigned,
            assignedToUserId: userId,
            createdAtUtc: assignedAtUtc,
            assignedAtUtc: assignedAtUtc,
            releasedAtUtc: null);

    public static SuiteNumberPoolEntry Rehydrate(
        SuiteNumberPoolEntryId id,
        string regionCode,
        string number,
        SuiteNumberPoolStatus status,
        UserId? assignedToUserId,
        DateTime createdAtUtc,
        DateTime? assignedAtUtc,
        DateTime? releasedAtUtc) =>
        new(id, regionCode, number, status, assignedToUserId, createdAtUtc, assignedAtUtc, releasedAtUtc);

    /// <summary>Domain-level state transition. The atomic Mongo claim does the equivalent in one op for safety.</summary>
    public void Claim(UserId userId, DateTime nowUtc)
    {
        if (Status != SuiteNumberPoolStatus.Available)
        {
            throw new InvalidOperationException(
                $"Suite number '{Number}' is not available (status: {Status}).");
        }

        Status = SuiteNumberPoolStatus.Assigned;
        AssignedToUserId = userId;
        AssignedAtUtc = nowUtc;
        ReleasedAtUtc = null;
    }

    /// <summary>Return a number to the pool (e.g. when ops reassigns a duplicate). Idempotent for already-available entries.</summary>
    public void Release(DateTime nowUtc)
    {
        if (Status == SuiteNumberPoolStatus.Available)
        {
            return;
        }

        Status = SuiteNumberPoolStatus.Available;
        AssignedToUserId = null;
        AssignedAtUtc = null;
        ReleasedAtUtc = nowUtc;
    }

    private static void Validate(string regionCode, string number)
    {
        if (string.IsNullOrWhiteSpace(regionCode))
        {
            throw new ArgumentException("Region code is required.", nameof(regionCode));
        }

        if (string.IsNullOrWhiteSpace(number))
        {
            throw new ArgumentException("Suite number is required.", nameof(number));
        }
    }
}
