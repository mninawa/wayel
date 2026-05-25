using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;

namespace Wayel.Application.Features.Quotes;

internal sealed class QuoteParcelStateResolver(
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IClock clock)
{
    public async Task<ParcelQuoteState> ResolveAsync(Parcel parcel, CancellationToken cancellationToken)
    {
        if (parcel.Status == ParcelStatus.Delivered)
        {
            return ParcelQuoteState.Shipped;
        }

        if (parcel.Status == ParcelStatus.InShipment)
        {
            return ParcelQuoteState.InShipment;
        }

        var links = await quoteParcels.ListForParcelAsync(parcel.Id, cancellationToken);
        if (links.Count == 0)
        {
            return ParcelQuoteState.NotQuoted;
        }

        Quote? latest = null;
        foreach (var link in links)
        {
            var quote = await quotes.GetByIdAsync(link.QuoteId, cancellationToken);
            if (quote is null)
            {
                continue;
            }

            if (latest is null || quote.CreatedAtUtc > latest.CreatedAtUtc)
            {
                latest = quote;
            }
        }

        if (latest is null)
        {
            return ParcelQuoteState.NotQuoted;
        }

        var now = clock.UtcNow;
        if (now > latest.ValidUntil && !QuoteStatusRules.IsOpen(latest.Status))
        {
            return ParcelQuoteState.QuoteExpired;
        }

        if (now > latest.ValidUntil)
        {
            return ParcelQuoteState.QuoteExpired;
        }

        return latest.Status switch
        {
            QuoteStatus.Draft => ParcelQuoteState.InQuote,
            QuoteStatus.ReadyForReview => ParcelQuoteState.Quoted,
            QuoteStatus.BlockedSuiteExpired => ParcelQuoteState.Quoted,
            QuoteStatus.Approved or QuoteStatus.PaymentPending => ParcelQuoteState.QuoteApproved,
            QuoteStatus.Paid or QuoteStatus.ConvertedToShipment => ParcelQuoteState.InShipment,
            QuoteStatus.Expired => ParcelQuoteState.QuoteExpired,
            QuoteStatus.Cancelled => ParcelQuoteState.NotQuoted,
            _ => ParcelQuoteState.Quoted,
        };
    }

    public async Task<(ParcelQuoteState State, Guid? OpenQuoteId, string? OpenQuoteDisplay)> ResolveWithOpenQuoteAsync(
        Parcel parcel,
        CancellationToken cancellationToken)
    {
        var state = await ResolveAsync(parcel, cancellationToken);
        var open = await quoteParcels.FindOpenQuoteForParcelAsync(parcel.Id, cancellationToken);
        if (open is null)
        {
            return (state, null, null);
        }

        return (
            state,
            open.Id.Value,
            $"QUO-{open.Id.Value.ToString("N")[..8].ToUpperInvariant()}");
    }

    public async Task<Guid?> ResolveShipmentIdAsync(Parcel parcel, CancellationToken cancellationToken)
    {
        if (parcel.Status is not (ParcelStatus.InShipment or ParcelStatus.Delivered))
        {
            return null;
        }

        var links = await quoteParcels.ListForParcelAsync(parcel.Id, cancellationToken);
        Quote? best = null;
        foreach (var link in links)
        {
            var quote = await quotes.GetByIdAsync(link.QuoteId, cancellationToken);
            if (quote?.ShipmentId is null)
            {
                continue;
            }

            if (best is null || quote.CreatedAtUtc > best.CreatedAtUtc)
            {
                best = quote;
            }
        }

        return best?.ShipmentId?.Value;
    }
}
