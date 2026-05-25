namespace Wayel.Application.Features.Tracking;

public sealed record OpsShipmentListItemDto(
    Guid ShipmentId,
    string Status,
    string StatusLabel,
    string CustomerDisplayName,
    string CustomerEmail,
    string? PrimaryTrackingNumber,
    int ParcelCount,
    string DeliveryMethod,
    DateTime? LastEventAtUtc);

public sealed record UpdateOpsShipmentStatusResultDto(
    Guid ShipmentId,
    string Status,
    string StatusLabel,
    string EventLabel,
    DateTime OccurredAtUtc);
