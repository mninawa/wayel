namespace Wayel.Application.Features.Collection;

public sealed record OpsCollectionParcelLineDto(
    Guid ParcelId,
    string DisplayId,
    string ItemName,
    string Retailer,
    string? Category,
    decimal? WeightKg,
    string StatusLabel);

public sealed record OpsCollectionBoardCardDto(
    string CardKey,
    string ColumnId,
    Guid ShipmentId,
    string DisplayId,
    string CustomerDisplayName,
    string? SuiteNumber,
    string HubId,
    string HubName,
    string HubCity,
    int ParcelCount,
    string StatusLabel,
    DateTime EventAtUtc,
    DateTime? ReadyForCollectionAtUtc,
    DateTime? CollectedAtUtc,
    bool NotificationSent,
    DateTime? NotificationSentAtUtc,
    string? CollectorIdType,
    string? CollectorIdNumberMasked,
    Guid? CoverPhotoId = null,
    IReadOnlyList<OpsCollectionParcelLineDto>? Parcels = null);

public sealed record OpsCollectionNotificationChannelDto(
    string Channel,
    string StatusLabel,
    string Title,
    string Body,
    DateTime? SentAtUtc,
    string? Detail);

public sealed record OpsCollectionCustomerNotificationDto(
    bool Triggered,
    DateTime? TriggeredAtUtc,
    IReadOnlyList<OpsCollectionNotificationChannelDto> Channels);

public sealed record OpsCollectionTrackingEventDto(
    string Title,
    string? Detail,
    DateTime OccurredAtUtc);

public sealed record OpsCollectionShipmentDetailDto(
    OpsCollectionBoardCardDto Card,
    string? CustomerEmail,
    string? CustomerPhone,
    string? DeliveryMethod,
    string? Destination,
    IReadOnlyList<OpsCollectionParcelLineDto> Parcels,
    IReadOnlyList<OpsCollectionTrackingEventDto> Timeline,
    OpsCollectionCustomerNotificationDto? CustomerNotification);

public sealed record OpsCollectionBoardColumnDto(
    string ColumnId,
    string Label,
    string Subtitle,
    int Count,
    IReadOnlyList<OpsCollectionBoardCardDto> Cards);

public sealed record OpsCollectionBoardDto(
    IReadOnlyList<OpsCollectionBoardColumnDto> Columns,
    IReadOnlyList<string> HubOptions);

public sealed record OpsCollectionScanResultDto(
    Guid ShipmentId,
    string DisplayId,
    string ColumnId,
    string HubName,
    string Message,
    bool NotificationSent);

public sealed record OpsCollectionPickupResultDto(
    Guid ShipmentId,
    string DisplayId,
    string Message);

public sealed record OpsCollectionMoveResultDto(
    Guid ShipmentId,
    string DisplayId,
    string ColumnId,
    string Message,
    bool NotificationSent);

public sealed record OpsCollectionBulkAdvanceResultDto(
    int MovedCount,
    int SkippedCount,
    string Message);
