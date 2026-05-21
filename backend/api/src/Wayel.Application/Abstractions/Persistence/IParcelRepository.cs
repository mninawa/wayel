using Wayel.Domain.Users;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

public interface IParcelRepository
{
    Task<IReadOnlyList<Parcel>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task<Parcel?> GetByIdAsync(ParcelId id, CancellationToken cancellationToken = default);
    Task AddAsync(Parcel parcel, CancellationToken cancellationToken = default);
}
