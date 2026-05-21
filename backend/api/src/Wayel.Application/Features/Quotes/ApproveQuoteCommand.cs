using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record ApproveQuoteCommand(Guid QuoteId) : ICommand<QuoteDto>;

public sealed record QuoteDto(Guid Id, Guid ShipmentId, decimal TotalLandedCost, string ApprovalStatus, string? ApprovalLockedReason);

internal sealed class ApproveQuoteCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IQuoteRepository quotes,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<ApproveQuoteCommand, QuoteDto>
{
    public async Task<Result<QuoteDto>> Handle(ApproveQuoteCommand request, CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var quote = await quotes.GetByIdAsync(new QuoteId(request.QuoteId), cancellationToken);
        if (quote is null)
        {
            return Error.NotFound("quote.not_found", "Quote not found.");
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        var approval = quote.Approve(caps.ShipOutLocked, caps.CustomerMessage);
        if (approval.IsFailure)
        {
            return Result.Failure<QuoteDto>(approval.Error);
        }

        await quotes.UpdateAsync(quote, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new QuoteDto(
            quote.Id.Value,
            quote.ShipmentId.Value,
            quote.TotalLandedCost,
            quote.ApprovalStatus.ToString(),
            quote.ApprovalLockedReason);
    }
}
