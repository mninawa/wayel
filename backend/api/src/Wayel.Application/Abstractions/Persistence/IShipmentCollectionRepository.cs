namespace Wayel.Application.Abstractions.Persistence;

public sealed record ShipmentCollectionRecord(
    Guid ShipmentId,
    Guid UserId,
    string ShipmentDisplayId,
    string Status,
    string HubId,
    string HubName,
    string HubCity,
    string CustomerDisplayName,
    string? SuiteNumber,
    int ParcelCount,
    DateTime DispatchedAtUtc,
    DateTime? ReadyForCollectionAtUtc,
    DateTime? NotificationSentAtUtc,
    DateTime? CollectedAtUtc,
    string? CollectorIdType,
    string? CollectorIdNumber,
    string? CollectorName,
    string? RecordedByOpsUserId,
    DateTime UpdatedAtUtc);

public interface IShipmentCollectionRepository
{
    Task<ShipmentCollectionRecord?> GetByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default);

    Task UpsertAsync(ShipmentCollectionRecord record, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ShipmentCollectionRecord>> ListByStatusesAsync(
        IReadOnlyList<string> statuses,
        int limit,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ShipmentCollectionRecord>> SearchAsync(
        string query,
        int limit,
        CancellationToken cancellationToken = default);
}
