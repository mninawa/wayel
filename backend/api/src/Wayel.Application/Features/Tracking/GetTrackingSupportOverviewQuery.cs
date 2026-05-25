using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record GetTrackingSupportOverviewQuery : IQuery<TrackingSupportOverviewDto>;

internal sealed class GetTrackingSupportOverviewQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IShipmentRepository shipments,
    IParcelRepository parcels,
    ICustomerAddressRepository addresses,
    ISupportTicketRepository tickets,
    IShipmentTrackingEventRepository trackingEvents) : IQueryHandler<GetTrackingSupportOverviewQuery, TrackingSupportOverviewDto>
{
    public async Task<Result<TrackingSupportOverviewDto>> Handle(
        GetTrackingSupportOverviewQuery request,
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

        var allShipments = await shipments.ListForUserAsync(user.Id, cancellationToken);
        var active = PickActiveShipment(allShipments);

        ShipmentTrackingDto? tracking = null;
        if (active is not null)
        {
            var shipmentParcels = await LoadParcels(active.ParcelIds, cancellationToken);
            var defaultAddress = (await addresses.ListForUserAsync(user.Id, cancellationToken))
                .FirstOrDefault(a => a.IsDefault);
            var to = defaultAddress is null
                ? "Eswatini"
                : $"{defaultAddress.City}, Eswatini";
            var events = await trackingEvents.ListForShipmentAsync(active.Id, cancellationToken);
            tracking = ShipmentTrackingMapper.Map(active, shipmentParcels, to, events);
        }

        var ticketList = await tickets.ListForUserAsync(user.Id, cancellationToken);
        SupportTicketSummaryDto? recentTicket = ticketList.Count > 0
            ? MapTicket(ticketList[0])
            : null;

        return new TrackingSupportOverviewDto(
            tracking,
            recentTicket,
            new NotificationPreferencesDto(
                user.NotifyEmail,
                user.NotifySms,
                user.NotifyWhatsApp));
    }

    private static Shipment? PickActiveShipment(IReadOnlyList<Shipment> items) =>
        items.FirstOrDefault(s => s.Status == ShipmentStatus.InTransit)
        ?? items.FirstOrDefault(s => s.Status is ShipmentStatus.AwaitingApproval or ShipmentStatus.Paid)
        ?? items.FirstOrDefault(s => s.Status != ShipmentStatus.Draft);

    private async Task<IReadOnlyList<Parcel>> LoadParcels(
        IReadOnlyList<ParcelId> ids,
        CancellationToken cancellationToken)
    {
        var list = new List<Parcel>();
        foreach (var id in ids)
        {
            var p = await parcels.GetByIdAsync(id, cancellationToken);
            if (p is not null)
            {
                list.Add(p);
            }
        }

        return list;
    }

    private static SupportTicketSummaryDto MapTicket(Domain.SupportTickets.SupportTicket t) =>
        new(
            t.Id.Value,
            $"SUP-{t.Id.Value.ToString("N")[..5].ToUpperInvariant()}",
            t.Subject,
            t.Body.Length > 120 ? t.Body[..117] + "…" : t.Body,
            t.Status.ToString(),
            t.CreatedAtUtc);
}
