using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

internal static class QuoteShipmentCreator
{
    public static async Task<Result<ShipmentId>> CreateFromQuoteAsync(
        Quote quote,
        User user,
        IQuoteParcelRepository quoteParcels,
        IParcelRepository parcels,
        IShipmentRepository shipments,
        CancellationToken cancellationToken)
    {
        if (quote.ShipmentId is { } existing)
        {
            return existing;
        }

        var links = await quoteParcels.ListForQuoteAsync(quote.Id, cancellationToken);
        var parcelIds = links.Select(l => l.ParcelId).ToList();
        if (parcelIds.Count == 0)
        {
            return Error.Validation("quote.no_parcels", "This quote has no linked parcels.");
        }

        var loaded = new List<Parcel>();
        foreach (var pid in parcelIds)
        {
            var parcel = await parcels.GetByIdAsync(pid, cancellationToken);
            if (parcel is null || parcel.UserId != user.Id)
            {
                return Error.Validation("quote.parcel_invalid", "One or more parcels are no longer valid.");
            }

            if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
            {
                return Error.Validation(
                    "quote.parcel_unavailable",
                    $"{parcel.ItemName} is already in another shipment.");
            }

            loaded.Add(parcel);
        }

        var creation = Shipment.Create(
            user.Id,
            parcelIds,
            quote.DeliveryMethod,
            shipOutLocked: false,
            lockReason: null);

        if (creation.IsFailure)
        {
            return Result.Failure<ShipmentId>(creation.Error);
        }

        var shipment = creation.Value;
        shipment.MarkQuoted();

        foreach (var parcel in loaded)
        {
            var mark = parcel.MarkInShipment();
            if (mark.IsSuccess)
            {
                await parcels.UpdateAsync(parcel, cancellationToken);
            }
        }

        quote.AttachShipment(shipment.Id);
        await shipments.AddAsync(shipment, cancellationToken);

        return shipment.Id;
    }
}
