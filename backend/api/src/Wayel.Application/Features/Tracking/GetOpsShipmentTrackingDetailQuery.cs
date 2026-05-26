using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Tracking;

/// <summary>
/// Ops-side counterpart to <see cref="GetShipmentTrackingDetailQuery"/> — returns
/// the same shipment tracking detail (status, parcels, address, events) without
/// the customer-ownership check, so the ops dashboard can show the full timeline
/// for any shipment.
///
/// Reuses <see cref="ShipmentTrackingDetailLoader"/> by resolving the shipment's
/// owning customer up-front and passing them in (so the existing loader's
/// per-customer code paths and DTO shape are reused as-is).
///
/// Authorization: the endpoint group already requires the KYC-ops policy, so
/// any signed-in ops user can read tracking. No extra capability check needed.
/// </summary>
public sealed record GetOpsShipmentTrackingDetailQuery(Guid ShipmentId) : IQuery<ShipmentTrackingDetailDto>;

internal sealed class GetOpsShipmentTrackingDetailQueryHandler(
    IShipmentRepository shipments,
    IUserRepository users,
    ShipmentTrackingDetailLoader loader)
    : IQueryHandler<GetOpsShipmentTrackingDetailQuery, ShipmentTrackingDetailDto>
{
    public async Task<Result<ShipmentTrackingDetailDto>> Handle(
        GetOpsShipmentTrackingDetailQuery request,
        CancellationToken cancellationToken)
    {
        var shipmentId = new ShipmentId(request.ShipmentId);
        var shipment = await shipments.GetByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        var customer = await users.GetByIdAsync(shipment.UserId, cancellationToken);
        if (customer is null)
        {
            // Pathological: a shipment without a resolvable customer. Refuse rather
            // than try to render a partial timeline so the operator sees the bug.
            return Error.NotFound("shipment.customer_not_found", "Customer not found for shipment.");
        }

        return await loader.LoadAsync(customer, shipmentId, cancellationToken);
    }
}
