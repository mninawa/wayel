using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Domain.Onboarding;

/// <summary>
/// Tracks a customer who chose the "Pay later — explore first" path during onboarding.
/// Persisted server-side (one row per user) so the choice survives device switches and
/// gives ops a funnel view of who hasn't paid yet.
///
/// Resolved when the customer's first suite subscription is activated; until then
/// <see cref="ResolvedAtUtc"/> is null and the user routes through /welcome on sign-in.
/// </summary>
public sealed class PayLaterIntent : AggregateRoot<PayLaterIntentId>
{
    private PayLaterIntent(
        PayLaterIntentId id,
        UserId userId,
        DateTime createdAtUtc,
        DateTime lastSeenAtUtc,
        DateTime? resolvedAtUtc,
        SuitePlanId? planAtSignal,
        string? planIdAtSignalLabel)
        : base(id)
    {
        UserId = userId;
        CreatedAtUtc = createdAtUtc;
        LastSeenAtUtc = lastSeenAtUtc;
        ResolvedAtUtc = resolvedAtUtc;
        PlanAtSignal = planAtSignal;
        PlanAtSignalLabel = planIdAtSignalLabel;
    }

    public UserId UserId { get; }
    public DateTime CreatedAtUtc { get; }
    public DateTime LastSeenAtUtc { get; private set; }
    public DateTime? ResolvedAtUtc { get; private set; }

    /// <summary>Plan the customer had selected on the picker when they deferred. Optional.</summary>
    public SuitePlanId? PlanAtSignal { get; private set; }

    /// <summary>Human-readable copy of the plan label at signal time (snapshot — won't follow plan renames).</summary>
    public string? PlanAtSignalLabel { get; private set; }

    public bool IsActive => ResolvedAtUtc is null;

    public static PayLaterIntent Create(
        UserId userId,
        DateTime nowUtc,
        SuitePlanId? planAtSignal = null,
        string? planLabel = null) =>
        new(
            PayLaterIntentId.New(),
            userId,
            nowUtc,
            nowUtc,
            null,
            planAtSignal,
            string.IsNullOrWhiteSpace(planLabel) ? null : planLabel.Trim());

    public static PayLaterIntent Rehydrate(
        PayLaterIntentId id,
        UserId userId,
        DateTime createdAtUtc,
        DateTime lastSeenAtUtc,
        DateTime? resolvedAtUtc,
        SuitePlanId? planAtSignal,
        string? planAtSignalLabel) =>
        new(id, userId, createdAtUtc, lastSeenAtUtc, resolvedAtUtc, planAtSignal, planAtSignalLabel);

    /// <summary>Idempotent "ping" — bumps last-seen and (if provided) updates the plan they're currently leaning towards.</summary>
    public void Touch(DateTime nowUtc, SuitePlanId? planAtSignal = null, string? planLabel = null)
    {
        if (nowUtc > LastSeenAtUtc)
        {
            LastSeenAtUtc = nowUtc;
        }

        if (planAtSignal is not null)
        {
            PlanAtSignal = planAtSignal;
            PlanAtSignalLabel = string.IsNullOrWhiteSpace(planLabel) ? PlanAtSignalLabel : planLabel.Trim();
        }
    }

    /// <summary>Mark the intent resolved (i.e. the customer paid). First write wins.</summary>
    public void Resolve(DateTime resolvedAtUtc)
    {
        ResolvedAtUtc ??= resolvedAtUtc;
    }
}
