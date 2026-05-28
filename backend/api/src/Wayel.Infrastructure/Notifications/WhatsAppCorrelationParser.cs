namespace Wayel.Infrastructure.Notifications;

internal static class WhatsAppCorrelationParser
{
    public static (Guid? ParcelId, Guid? ShipmentId, string MessageKind) Parse(string? correlationTag)
    {
        if (string.IsNullOrWhiteSpace(correlationTag))
        {
            return (null, null, "WhatsApp");
        }

        var tag = correlationTag.Trim();
        var colon = tag.IndexOf(':');
        var prefix = colon >= 0 ? tag[..colon] : tag;
        var suffix = colon >= 0 ? tag[(colon + 1)..] : "";

        Guid? parcelId = null;
        Guid? shipmentId = null;

        if (prefix is "parcel-received" or "parcel-ready-for-quote" or "invoice-rejected")
        {
            if (Guid.TryParse(suffix, out var id))
            {
                parcelId = id;
            }
        }
        else if (prefix == "inspection-saved")
        {
            var idPart = suffix.Split(':')[0];
            if (Guid.TryParse(idPart, out var id))
            {
                parcelId = id;
            }
        }
        else if (prefix == "ready-for-collection")
        {
            if (Guid.TryParse(suffix, out var id))
            {
                shipmentId = id;
            }
        }

        var kind = prefix switch
        {
            "parcel-received" => "Parcel received",
            "parcel-ready-for-quote" => "Ready for quote",
            "invoice-rejected" => "Invoice rejected",
            "inspection-saved" => "Inspection update",
            "quote-ready" => "Quote ready",
            "quote-paid" => "Quote paid",
            "support-ack" => "Support acknowledgement",
            "ready-for-collection" => "Ready for collection",
            "support.whatsapp_test" => "Support test",
            _ => "WhatsApp notification",
        };

        return (parcelId, shipmentId, kind);
    }
}
