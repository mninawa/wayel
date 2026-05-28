using Wayel.Domain.Users;

namespace Wayel.Application.Features.Collection;

internal static class CollectionNotificationPreview
{
    public static string WhatsAppCorrelationTag(Guid shipmentId) =>
        $"ready-for-collection:{shipmentId:D}";

    public static string BuildWhatsAppBody(
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        string customerPortalBaseUrl)
    {
        var portalBase = customerPortalBaseUrl.Trim().TrimEnd('/');
        var trackingUrl = $"{portalBase}/shipments";
        return
            "Your parcel has arrived in Eswatini and is ready for collection.\n\n"
            + $"Shipment: {shipmentDisplayId.Trim()}\n"
            + $"Pickup location: {hubName.Trim()}, {hubCity.Trim()}\n\n"
            + "Please bring your National ID or Passport when collecting your order.\n\n"
            + trackingUrl;
    }

    public static string BuildEmailSubject(string shipmentDisplayId) =>
        $"Ready for collection — {shipmentDisplayId.Trim()}";

    public static string BuildEmailBody(
        User user,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        string customerPortalBaseUrl)
    {
        var portalBase = customerPortalBaseUrl.Trim().TrimEnd('/');
        return
            $"Hello {user.DisplayName},\n\n"
            + "Your parcel has arrived in Eswatini and is ready for collection.\n\n"
            + $"Shipment: {shipmentDisplayId.Trim()}\n"
            + $"Pickup location: {hubName.Trim()}, {hubCity.Trim()}\n\n"
            + "Please bring your National ID or Passport when collecting your order.\n\n"
            + $"Track your shipment: {portalBase}/shipments\n\n"
            + "— WeYell";
    }

    public static string BuildInAppTitle() => "Ready for collection";

    public static string BuildInAppBody(
        string shipmentDisplayId,
        string hubName,
        string hubCity) =>
        $"Shipment {shipmentDisplayId.Trim()} has arrived at {hubName.Trim()}, "
        + $"{hubCity.Trim()}. Bring your National ID or Passport when collecting.";

    public static string MaskPhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return "—";
        }

        var trimmed = phone.Trim();
        if (trimmed.Length <= 6)
        {
            return trimmed;
        }

        return $"{trimmed[..Math.Min(4, trimmed.Length)]}***{trimmed[^4..]}";
    }
}
