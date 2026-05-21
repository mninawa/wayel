using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record ListParcelsQuery : IQuery<IReadOnlyList<ParcelDto>>;

public sealed record ParcelDto(
    Guid Id,
    string Retailer,
    string? TrackingNumber,
    string Status,
    decimal? WeightKg,
    DateTime ReceivedAtUtc);

internal sealed class ListParcelsQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels) : IQueryHandler<ListParcelsQuery, IReadOnlyList<ParcelDto>>
{
    public async Task<Result<IReadOnlyList<ParcelDto>>> Handle(ListParcelsQuery request, CancellationToken cancellationToken)
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

        var items = await parcels.ListForUserAsync(user.Id, cancellationToken);
        return items
            .Select(p => new ParcelDto(
                p.Id.Value,
                p.Retailer,
                p.TrackingNumber,
                p.Status.ToString(),
                p.WeightKg,
                p.ReceivedAtUtc))
            .ToList();
    }
}
