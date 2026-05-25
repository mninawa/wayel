using MediatR;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Shipments;

/// <summary>
/// Legacy route — creates a <see cref="Quotes.CreateQuoteRequestCommand"/> (no shipment until payment).
/// </summary>
public sealed record CreateShipmentCommand(
    IReadOnlyList<Guid> ParcelIds,
    string DeliveryMethod) : ICommand<ShipmentDto>;

public sealed record ShipmentDto(
    Guid Id,
    Guid QuoteId,
    string Status,
    string? ShipOutLockedReason);

internal sealed class CreateShipmentCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IMediator mediator) : ICommandHandler<CreateShipmentCommand, ShipmentDto>
{
    public async Task<Result<ShipmentDto>> Handle(
        CreateShipmentCommand request,
        CancellationToken cancellationToken)
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

        var quoteResult = await mediator.Send(
            new CreateQuoteRequestCommand(request.ParcelIds, request.DeliveryMethod),
            cancellationToken);

        if (quoteResult.IsFailure)
        {
            return Result.Failure<ShipmentDto>(quoteResult.Error);
        }

        var quote = quoteResult.Value;
        return new ShipmentDto(
            Guid.Empty,
            quote.QuoteId,
            quote.Status,
            quote.Status.Contains("expired", StringComparison.OrdinalIgnoreCase)
                ? "Renew suite access to approve and pay."
                : null);
    }
}
