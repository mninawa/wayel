using Wayel.Application.Abstractions.Persistence;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ShipmentCollectionDocument
{
    public Guid ShipmentId { get; set; }
    public Guid UserId { get; set; }
    public string ShipmentDisplayId { get; set; } = "";
    public string Status { get; set; } = "";
    public string HubId { get; set; } = "";
    public string HubName { get; set; } = "";
    public string HubCity { get; set; } = "";
    public string CustomerDisplayName { get; set; } = "";
    public string? SuiteNumber { get; set; }
    public int ParcelCount { get; set; }
    public DateTime DispatchedAtUtc { get; set; }
    public DateTime? ReadyForCollectionAtUtc { get; set; }
    public DateTime? NotificationSentAtUtc { get; set; }
    public DateTime? CollectedAtUtc { get; set; }
    public string? CollectorIdType { get; set; }
    public string? CollectorIdNumber { get; set; }
    public string? CollectorName { get; set; }
    public string? RecordedByOpsUserId { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public static ShipmentCollectionDocument From(ShipmentCollectionRecord r) => new()
    {
        ShipmentId = r.ShipmentId,
        UserId = r.UserId,
        ShipmentDisplayId = r.ShipmentDisplayId,
        Status = r.Status,
        HubId = r.HubId,
        HubName = r.HubName,
        HubCity = r.HubCity,
        CustomerDisplayName = r.CustomerDisplayName,
        SuiteNumber = r.SuiteNumber,
        ParcelCount = r.ParcelCount,
        DispatchedAtUtc = r.DispatchedAtUtc,
        ReadyForCollectionAtUtc = r.ReadyForCollectionAtUtc,
        NotificationSentAtUtc = r.NotificationSentAtUtc,
        CollectedAtUtc = r.CollectedAtUtc,
        CollectorIdType = r.CollectorIdType,
        CollectorIdNumber = r.CollectorIdNumber,
        CollectorName = r.CollectorName,
        RecordedByOpsUserId = r.RecordedByOpsUserId,
        UpdatedAtUtc = r.UpdatedAtUtc,
    };

    public ShipmentCollectionRecord ToRecord() => new(
        ShipmentId,
        UserId,
        ShipmentDisplayId,
        Status,
        HubId,
        HubName,
        HubCity,
        CustomerDisplayName,
        SuiteNumber,
        ParcelCount,
        DispatchedAtUtc,
        ReadyForCollectionAtUtc,
        NotificationSentAtUtc,
        CollectedAtUtc,
        CollectorIdType,
        CollectorIdNumber,
        CollectorName,
        RecordedByOpsUserId,
        UpdatedAtUtc);
}
