using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Onboarding;
using Wayel.Domain.SuitePlans;

namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// Customer chose "Pay later — explore first" during onboarding. Idempotent:
/// re-issuing it just refreshes <c>LastSeenAtUtc</c> and (if provided) updates
/// the plan they were leaning towards.
/// </summary>
public sealed record MarkPayLaterIntentCommand(Guid? PlanId) : ICommand<OnboardingIntentDto>;

internal sealed class MarkPayLaterIntentCommandHandler(
    ICurrentUser current,
    IPayLaterIntentRepository repository,
    ISuitePlanRepository plans,
    IClock clock) : ICommandHandler<MarkPayLaterIntentCommand, OnboardingIntentDto>
{
    public async Task<Result<OnboardingIntentDto>> Handle(
        MarkPayLaterIntentCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var nowUtc = clock.UtcNow;

        // Resolve plan label snapshot when caller supplied a plan — keeps the
        // ops list readable even if a plan is renamed or archived later.
        SuitePlanId? planId = null;
        string? planLabel = null;
        if (request.PlanId is { } pid && pid != Guid.Empty)
        {
            planId = new SuitePlanId(pid);
            var plan = await plans.GetByIdAsync(planId.Value, cancellationToken);
            if (plan is not null)
            {
                planLabel = plan.Name;
            }
        }

        var existing = await repository.GetByUserAsync(current.UserId.Value, cancellationToken);
        if (existing is null)
        {
            var fresh = PayLaterIntent.Create(current.UserId.Value, nowUtc, planId, planLabel);
            await repository.UpsertAsync(fresh, cancellationToken);
            return Map(fresh);
        }

        existing.Touch(nowUtc, planId, planLabel);
        await repository.UpsertAsync(existing, cancellationToken);
        return Map(existing);
    }

    private static OnboardingIntentDto Map(PayLaterIntent intent) =>
        new(
            "pay_later",
            intent.CreatedAtUtc.ToString("o"),
            intent.LastSeenAtUtc.ToString("o"),
            intent.PlanAtSignal?.Value.ToString(),
            intent.PlanAtSignalLabel);
}
