using Wayel.Domain.Shipments;

namespace Wayel.Application.Abstractions.Persistence;

public interface IShipmentRepository
{
    Task<Shipment?> GetByIdAsync(ShipmentId id, CancellationToken cancellationToken = default);
    Task AddAsync(Shipment shipment, CancellationToken cancellationToken = default);
    Task UpdateAsync(Shipment shipment, CancellationToken cancellationToken = default);
}
