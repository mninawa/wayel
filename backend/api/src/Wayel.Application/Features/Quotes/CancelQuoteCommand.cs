using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record CancelQuoteCommand(Guid QuoteId) : ICommand<QuoteDto>;

internal sealed class CancelQuoteCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IQuoteRepository quotes,
    IUnitOfWork unitOfWork) : ICommandHandler<CancelQuoteCommand, QuoteDto>
{
    public async Task<Result<QuoteDto>> Handle(CancelQuoteCommand request, CancellationToken cancellationToken)
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
        if (quote is null || quote.UserId != user.Id)
        {
            return Error.NotFound("quote.not_found", "Quote not found.");
        }

        var cancel = quote.TryCancel();
        if (cancel.IsFailure)
        {
            return Result.Failure<QuoteDto>(cancel.Error);
        }

        await quotes.UpdateAsync(quote, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new QuoteDto(
            quote.Id.Value,
            quote.ShipmentId?.Value,
            quote.TotalLandedCost,
            QuoteStatusRules.ToDisplayLabel(quote.Status),
            quote.StatusReason);
    }
}
