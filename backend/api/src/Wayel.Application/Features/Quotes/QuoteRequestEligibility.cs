using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Quotes;

/// <summary>Rules for whether a customer can add a parcel to a new quote request.</summary>
public static class QuoteRequestEligibility
{
    public sealed record Result(bool CanRequest, string? Blocker);

    public static Result Evaluate(Parcel parcel, ParcelInvoice? invoice, Guid? openQuoteId)
    {
        if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
        {
            return new(
                false,
                parcel.Status == ParcelStatus.InShipment
                    ? "Already in a shipment"
                    : "Delivered");
        }

        if (openQuoteId.HasValue)
        {
            return new(false, "Already on an open quote");
        }

        if (invoice is null)
        {
            return new(false, "Upload an invoice first");
        }

        if (parcel.WeightKg is null or <= 0)
        {
            return new(false, "Weight required");
        }

        if (string.IsNullOrWhiteSpace(parcel.DimensionsLabel))
        {
            return new(false, "Dimensions required");
        }

        if (parcel.DeclaredValueZar is null or <= 0)
        {
            return new(false, "Declared value required");
        }

        if (string.IsNullOrWhiteSpace(parcel.ItemName))
        {
            return new(false, "Item name required");
        }

        return new(true, null);
    }
}
