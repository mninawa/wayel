using Wayel.Domain.Parcels;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ParcelOpsMetadataDocument
{
    public ParcelId ParcelId { get; set; }
    public string? WarehouseLocation { get; set; }
    public string ConditionStatus { get; set; } = "NOT_INSPECTED";
    public string? InspectionNotes { get; set; }
    public string? PackagingType { get; set; }
    public bool OuterPackagingIntact { get; set; }
    public bool SealIntact { get; set; }
    public bool LabelReadable { get; set; }
    public bool GoodsAsDescribed { get; set; }
    public DateTime? InspectedAtUtc { get; set; }
    public string? InspectedBy { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public string? LocationId { get; set; }
    public string WarehouseStatus { get; set; } = "NOT_STORED";
}
