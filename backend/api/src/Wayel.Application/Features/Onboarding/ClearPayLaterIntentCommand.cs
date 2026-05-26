using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Onboarding;

/// <summary>
/// Customer explicitly cleared their pay-later intent. Almost always called
/// automatically by the suite-checkout completion handler — exposed via the API
/// mainly so the frontend can offer a "Activate now / don't remind me" affordance.
/// </summary>
public sealed record ClearPayLaterIntentCommand : ICommand;

internal sealed class ClearPayLaterIntentCommandHandler(
    ICurrentUser current,
    IPayLaterIntentRepository repository,
    IClock clock) : ICommandHandler<ClearPayLaterIntentCommand>
{
    public async Task<Result> Handle(
        ClearPayLaterIntentCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        await repository.MarkResolvedAsync(current.UserId.Value, clock.UtcNow, cancellationToken);
        return Result.Success();
    }
}
