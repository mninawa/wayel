namespace Wayel.Application.Features.Tracking;

public sealed record ShipmentTrackingMilestoneDto(
    string Label,
    string Icon,
    bool Done,
    bool Current,
    DateTime? OccurredAtUtc);

public sealed record ShipmentTrackingParcelRowDto(
    string TrackingNumber,
    string ItemName,
    decimal? WeightKg,
    string Status,
    string StatusLabel);

public sealed record ShipmentTrackingHistoryEventDto(
    DateTime OccurredAtUtc,
    string EventLabel,
    string EventTone,
    string Location,
    string Details);

public sealed record CourierInfoDto(string Name, string Website, string Phone);

public sealed record RecipientInfoDto(string Name, string Phone, string Address);

public sealed record ShipmentTrackingDetailDto(
    Guid ShipmentId,
    string TrackingNumber,
    string Status,
    string StatusLabel,
    string DeliveryMethod,
    string EstimatedDelivery,
    string OriginLabel,
    string DestinationLabel,
    int ParcelCount,
    string TotalWeightLabel,
    string DeclaredValueLabel,
    IReadOnlyList<ShipmentTrackingMilestoneDto> Milestones,
    IReadOnlyList<ShipmentTrackingParcelRowDto> Parcels,
    CourierInfoDto Courier,
    RecipientInfoDto Recipient,
    IReadOnlyList<ShipmentTrackingHistoryEventDto> History,
    string TimezoneNote);
