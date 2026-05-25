namespace Wayel.Domain.Shipments;

public static class ShipmentTrackingEventTypes
{
    public const string Created = "shipment.created";
    public const string PaymentReceived = "payment.received";
    public const string ReadyForDispatch = "shipment.ready_for_dispatch";
    public const string Dispatched = "shipment.dispatched";
    public const string InTransit = "shipment.in_transit";
    public const string ArrivedInCountry = "shipment.arrived_in_country";
    public const string ReadyForCollection = "shipment.ready_for_collection";
    public const string CustomsCleared = "shipment.customs_cleared";
    public const string OutForDelivery = "shipment.out_for_delivery";
    public const string Delivered = "shipment.delivered";

    /// <summary>
    /// Canonical journey order for a cross-border shipment (earliest → latest).
    /// Used when timestamps overlap or were recorded out of sequence.
    /// </summary>
    public static int JourneyOrder(string eventType) => eventType switch
    {
        Created => 10,
        PaymentReceived => 20,
        ReadyForDispatch => 30,
        InTransit => 40,
        Dispatched => 50,
        ArrivedInCountry => 60,
        ReadyForCollection => 70,
        CustomsCleared => 80,
        OutForDelivery => 90,
        Delivered => 100,
        _ => 999,
    };
}
