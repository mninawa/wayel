using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record GetParcelQuery(Guid ParcelId) : IQuery<ParcelDetailDto>;

internal sealed class GetParcelQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    ISuiteSubscriptionRepository subscriptions,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IShipmentRepository shipments,
    IClock clock) : IQueryHandler<GetParcelQuery, ParcelDetailDto>
{
    public async Task<Result<ParcelDetailDto>> Handle(GetParcelQuery request, CancellationToken cancellationToken)
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

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null || parcel.UserId != user.Id)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);

        string? downloadUrl = invoice?.StorageKey is not null
            ? $"/api/v1/borderbox/parcels/{parcel.Id.Value}/invoice/download"
            : null;

        var displaySuite = subscription?.SuiteNumber;
        var resolver = new QuoteParcelStateResolver(quotes, quoteParcels, clock);
        var (state, openId, openDisplay) = await resolver.ResolveWithOpenQuoteAsync(parcel, cancellationToken);
        var shipmentId = await resolver.ResolveShipmentIdAsync(parcel, cancellationToken)
            ?? await FindShipmentIdForParcelAsync(user.Id, parcel.Id, shipments, cancellationToken);
        return ParcelMapping.ToDetail(
            parcel,
            invoice,
            caps.CanUploadInvoices,
            clock.UtcNow,
            state.ToString(),
            ParcelQuoteStateRules.ToLabel(state),
            openId,
            openDisplay,
            shipmentId,
            downloadUrl,
            displaySuite);
    }

    private static async Task<Guid?> FindShipmentIdForParcelAsync(
        UserId userId,
        ParcelId parcelId,
        IShipmentRepository shipments,
        CancellationToken cancellationToken)
    {
        var all = await shipments.ListForUserAsync(userId, cancellationToken);
        var match = all
            .Where(s => s.ParcelIds.Contains(parcelId))
            .OrderByDescending(s => s.Status switch
            {
                ShipmentStatus.InTransit => 100,
                ShipmentStatus.Paid => 80,
                ShipmentStatus.AwaitingApproval => 60,
                ShipmentStatus.Quoted => 40,
                ShipmentStatus.Delivered => 30,
                _ => 0,
            })
            .FirstOrDefault();

        return match?.Id.Value;
    }
}
