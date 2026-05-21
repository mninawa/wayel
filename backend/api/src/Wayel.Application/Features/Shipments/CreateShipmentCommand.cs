using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Shipments;

public sealed record CreateShipmentCommand(
    IReadOnlyList<Guid> ParcelIds,
    string DeliveryMethod) : ICommand<ShipmentDto>;

public sealed record ShipmentDto(Guid Id, string Status, string? ShipOutLockedReason);

internal sealed class CreateShipmentCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IShipmentRepository shipments,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<CreateShipmentCommand, ShipmentDto>
{
    public async Task<Result<ShipmentDto>> Handle(CreateShipmentCommand request, CancellationToken cancellationToken)
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

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);

        var parcelIds = request.ParcelIds.Select(id => new ParcelId(id)).ToList();
        var creation = Shipment.Create(
            user.Id,
            parcelIds,
            request.DeliveryMethod,
            caps.ShipOutLocked,
            caps.CustomerMessage);

        if (creation.IsFailure)
        {
            return Result.Failure<ShipmentDto>(creation.Error);
        }

        var shipment = creation.Value;
        await shipments.AddAsync(shipment, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new ShipmentDto(shipment.Id.Value, shipment.Status.ToString(), shipment.ShipOutLockedReason);
    }
}
