using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// Returns the signed-in customer's pay-later intent, or <c>null</c> when none.
/// The /account response embeds the same shape — this endpoint is mainly used
/// after a write to confirm the round-trip and warm any client-side cache.
/// </summary>
public sealed record GetMyPayLaterIntentQuery : IQuery<OnboardingIntentDto?>;

internal sealed class GetMyPayLaterIntentQueryHandler(
    ICurrentUser current,
    IPayLaterIntentRepository repository) : IQueryHandler<GetMyPayLaterIntentQuery, OnboardingIntentDto?>
{
    public async Task<Result<OnboardingIntentDto?>> Handle(
        GetMyPayLaterIntentQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var intent = await repository.GetByUserAsync(current.UserId.Value, cancellationToken);
        if (intent is null || !intent.IsActive)
        {
            // Only surface ACTIVE intents to the customer SPA. Resolved rows
            // stay in Mongo for ops analytics but are invisible to the user.
            return Result.Success<OnboardingIntentDto?>(null);
        }

        return Result.Success<OnboardingIntentDto?>(new OnboardingIntentDto(
            "pay_later",
            intent.CreatedAtUtc.ToString("o"),
            intent.LastSeenAtUtc.ToString("o"),
            intent.PlanAtSignal?.Value.ToString(),
            intent.PlanAtSignalLabel));
    }
}
