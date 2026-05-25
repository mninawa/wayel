using Wayel.Application.Features.Quotes;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

public sealed class QuoteRequestEligibilityTests
{
    private static Parcel MakeParcel(ParcelStatus status) =>
        Parcel.Rehydrate(
            ParcelId.New(),
            UserId.New(),
            "BBSA-10001",
            "Amazon",
            "FBA15JD9C5R9U000001",
            "Test item",
            "Electronics",
            1500m,
            "10x10x10",
            status,
            2m,
            DateTime.UtcNow);

    [Fact]
    public void Ready_parcel_with_invoice_can_request_quote()
    {
        var parcel = MakeParcel(ParcelStatus.ReadyToShip);
        var invoice = ParcelInvoice.Upload(
            parcel.Id,
            parcel.UserId,
            "invoice.pdf",
            1000,
            DateTime.UtcNow);

        var result = QuoteRequestEligibility.Evaluate(parcel, invoice, openQuoteId: null);

        Assert.True(result.CanRequest);
        Assert.Null(result.Blocker);
    }

    [Fact]
    public void InShipment_parcel_is_blocked()
    {
        var parcel = MakeParcel(ParcelStatus.InShipment);
        var invoice = ParcelInvoice.Upload(
            parcel.Id,
            parcel.UserId,
            "invoice.pdf",
            1000,
            DateTime.UtcNow);

        var result = QuoteRequestEligibility.Evaluate(parcel, invoice, openQuoteId: null);

        Assert.False(result.CanRequest);
        Assert.Equal("Already in a shipment", result.Blocker);
    }
}
