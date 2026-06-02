using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Domain.SuiteSubscriptions;

public sealed class SuiteSubscription : AggregateRoot<SuiteSubscriptionId>
{
    private SuiteSubscription(
        SuiteSubscriptionId id,
        UserId userId,
        SuitePlanId planId,
        string suiteNumber,
        SuiteAccessStatus status,
        DateTime? startedAt,
        DateTime? expiresAt,
        bool isTrial = false)
        : base(id)
    {
        UserId = userId;
        PlanId = planId;
        SuiteNumber = suiteNumber;
        Status = status;
        StartedAt = startedAt;
        ExpiresAt = expiresAt;
        IsTrial = isTrial;
    }

    public UserId UserId { get; }
    public SuitePlanId PlanId { get; }
    public string SuiteNumber { get; private set; }
    public SuiteAccessStatus Status { get; private set; }
    public DateTime? StartedAt { get; private set; }
    public DateTime? ExpiresAt { get; private set; }
    public bool IsTrial { get; private set; }

    public bool ShipOutLocked => Status is SuiteAccessStatus.Expired or SuiteAccessStatus.PendingPayment or SuiteAccessStatus.Suspended;

    public static SuiteSubscription CreatePending(UserId userId, SuitePlanId planId, string suiteNumber) =>
        new(SuiteSubscriptionId.New(), userId, planId, suiteNumber, SuiteAccessStatus.PendingPayment, null, null);

    public static SuiteSubscription Rehydrate(
        SuiteSubscriptionId id,
        UserId userId,
        SuitePlanId planId,
        string suiteNumber,
        SuiteAccessStatus status,
        DateTime? startedAt,
        DateTime? expiresAt,
        bool isTrial = false) =>
        new(id, userId, planId, suiteNumber, status, startedAt, expiresAt, isTrial);

    public void Activate(DateTime startedAt, DateTime expiresAt, bool isTrial = false)
    {
        Status = SuiteAccessStatus.Active;
        StartedAt = startedAt;
        ExpiresAt = expiresAt;
        IsTrial = isTrial;
    }

    public void Renew(DateTime expiresAt)
    {
        Status = SuiteAccessStatus.Active;
        ExpiresAt = expiresAt;
        IsTrial = false;
        if (StartedAt is null)
        {
            StartedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Ops-only: rebind the subscription to a freshly-claimed pool number when
    /// reconciling a historical duplicate. Domain refuses empty rebinds so a
    /// caller can't accidentally orphan the subscription mid-reassignment.
    /// </summary>
    public void RebindSuiteNumber(string newSuiteNumber)
    {
        if (string.IsNullOrWhiteSpace(newSuiteNumber))
        {
            throw new ArgumentException("New suite number is required.", nameof(newSuiteNumber));
        }

        SuiteNumber = newSuiteNumber.Trim();
    }

    public void RefreshStatus(DateTime nowUtc, int expiringSoonDays = 7)
    {
        if (Status is SuiteAccessStatus.PendingPayment or SuiteAccessStatus.Suspended)
        {
            return;
        }

        if (ExpiresAt is null)
        {
            Status = SuiteAccessStatus.PendingPayment;
            return;
        }

        if (ExpiresAt <= nowUtc)
        {
            Status = SuiteAccessStatus.Expired;
            return;
        }

        Status = ExpiresAt <= nowUtc.AddDays(expiringSoonDays)
            ? SuiteAccessStatus.ExpiringSoon
            : SuiteAccessStatus.Active;
    }
}
