using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record OpsShipmentPage(IReadOnlyList<Shipment> Items, int TotalCount);

public interface IShipmentRepository
{
    Task<Shipment?> GetByIdAsync(ShipmentId id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Shipment>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Shipment>> ListActiveForOpsAsync(int limit, CancellationToken cancellationToken = default);

    Task<OpsShipmentPage> ListByStatusPageAsync(
        ShipmentStatus status,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task AddAsync(Shipment shipment, CancellationToken cancellationToken = default);

    Task UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default);
}
