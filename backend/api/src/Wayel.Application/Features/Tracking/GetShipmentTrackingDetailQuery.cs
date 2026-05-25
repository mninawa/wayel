using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record GetShipmentTrackingDetailQuery(Guid ShipmentId) : IQuery<ShipmentTrackingDetailDto>;

internal sealed class GetShipmentTrackingDetailQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    ShipmentTrackingDetailLoader loader) : IQueryHandler<GetShipmentTrackingDetailQuery, ShipmentTrackingDetailDto>
{
    public async Task<Result<ShipmentTrackingDetailDto>> Handle(
        GetShipmentTrackingDetailQuery request,
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

        return await loader.LoadAsync(user, new ShipmentId(request.ShipmentId), cancellationToken);
    }
}
