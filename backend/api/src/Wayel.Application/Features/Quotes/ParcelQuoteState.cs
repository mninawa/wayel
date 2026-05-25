namespace Wayel.Application.Features.Quotes;

/// <summary>Parcel-level quote display state (Phase 1).</summary>
public enum ParcelQuoteState
{
    NotQuoted,
    QuoteRequested,
    InQuote,
    Quoted,
    QuoteExpired,
    QuoteApproved,
    InShipment,
    Shipped,
}

public static class ParcelQuoteStateRules
{
    public static string ToLabel(ParcelQuoteState state) => state switch
    {
        ParcelQuoteState.NotQuoted => "Not quoted",
        ParcelQuoteState.QuoteRequested => "Quote requested",
        ParcelQuoteState.InQuote => "In quote",
        ParcelQuoteState.Quoted => "Quoted",
        ParcelQuoteState.QuoteExpired => "Quote expired",
        ParcelQuoteState.QuoteApproved => "Quote approved",
        ParcelQuoteState.InShipment => "In shipment",
        ParcelQuoteState.Shipped => "Shipped",
        _ => state.ToString(),
    };
}
