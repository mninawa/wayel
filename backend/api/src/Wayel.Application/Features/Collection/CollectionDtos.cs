namespace Wayel.Application.Features.Collection;

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
    string? CollectorIdType,
    string? CollectorIdNumberMasked,
    Guid? CoverPhotoId = null);

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
