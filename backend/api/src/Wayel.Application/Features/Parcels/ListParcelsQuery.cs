using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record ListParcelsQuery : IQuery<IReadOnlyList<ParcelListItemDto>>;

internal sealed class ListParcelsQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IShipmentRepository shipments,
    IClock clock) : IQueryHandler<ListParcelsQuery, IReadOnlyList<ParcelListItemDto>>
{
    public async Task<Result<IReadOnlyList<ParcelListItemDto>>> Handle(
        ListParcelsQuery request,
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

        var items = await parcels.ListForUserAsync(user.Id, cancellationToken);
        var invoiceMap = await invoices.ListForUserAsync(user.Id, cancellationToken);
        var resolver = new QuoteParcelStateResolver(quotes, quoteParcels, clock);
        var shipmentByParcel = await BuildParcelShipmentMapAsync(user.Id, shipments, resolver, cancellationToken);
        var result = new List<ParcelListItemDto>();

        foreach (var p in items)
        {
            var (state, openId, openDisplay) = await resolver.ResolveWithOpenQuoteAsync(p, cancellationToken);
            Guid? shipmentId = shipmentByParcel.TryGetValue(p.Id.Value, out var mapped)
                ? mapped
                : await resolver.ResolveShipmentIdAsync(p, cancellationToken);
            var invoice = invoiceMap.GetValueOrDefault(p.Id);
            var eligibility = QuoteRequestEligibility.Evaluate(p, invoice, openId);
            result.Add(ParcelMapping.ToListItem(
                p,
                invoice,
                state.ToString(),
                ParcelQuoteStateRules.ToLabel(state),
                openId,
                openDisplay,
                eligibility.CanRequest,
                eligibility.Blocker,
                shipmentId));
        }

        return result;
    }

    private static async Task<Dictionary<Guid, Guid>> BuildParcelShipmentMapAsync(
        UserId userId,
        IShipmentRepository shipments,
        QuoteParcelStateResolver resolver,
        CancellationToken cancellationToken)
    {
        var map = new Dictionary<Guid, Guid>();
        var all = await shipments.ListForUserAsync(userId, cancellationToken);
        foreach (var shipment in all.OrderByDescending(ShipmentPriority))
        {
            foreach (var parcelId in shipment.ParcelIds)
            {
                map.TryAdd(parcelId.Value, shipment.Id.Value);
            }
        }

        return map;
    }

    private static int ShipmentPriority(Shipment shipment) =>
        shipment.Status switch
        {
            ShipmentStatus.InTransit => 100,
            ShipmentStatus.Paid => 80,
            ShipmentStatus.AwaitingApproval => 60,
            ShipmentStatus.Quoted => 40,
            ShipmentStatus.Delivered => 30,
            _ => 0,
        };
}
