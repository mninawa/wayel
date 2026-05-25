namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class WarehouseLocationDocument
{
    public string LocationId { get; set; } = "";
    public string WarehouseId { get; set; } = "";
    public string Zone { get; set; } = "";
    public string Aisle { get; set; } = "";
    public string Shelf { get; set; } = "";
    public string Bin { get; set; } = "";
    public int Capacity { get; set; }
    public int Occupancy { get; set; }
    public string StorageType { get; set; } = "Standard";
    public string Status { get; set; } = "ACTIVE";
    public DateTime UpdatedAtUtc { get; set; }
}

internal sealed class WarehouseMovementDocument
{
    public Guid MovementId { get; set; }
    public Guid ParcelId { get; set; }
    public string? FromLocationId { get; set; }
    public string ToLocationId { get; set; } = "";
    public string MovementType { get; set; } = "";
    public string? MovedBy { get; set; }
    public DateTime MovedAtUtc { get; set; }
    public string? Notes { get; set; }
}

internal sealed class PickTaskParcelLineDocument
{
    public Guid ParcelId { get; set; }
    public string DisplayId { get; set; } = "";
    public string ItemName { get; set; } = "";
    public string? LocationId { get; set; }
    public string PickStatus { get; set; } = "PICK_PENDING";
    public string? PickedBy { get; set; }
    public DateTime? PickedAtUtc { get; set; }
    public string? IssueReason { get; set; }
}

internal sealed class PickTaskDocument
{
    public Guid PickTaskId { get; set; }
    public string DisplayId { get; set; } = "";
    public Guid ShipmentId { get; set; }
    public string Status { get; set; } = "PENDING";
    public string? AssignedTo { get; set; }
    public string CustomerDisplayName { get; set; } = "";
    public string SuiteNumber { get; set; } = "";
    public string Priority { get; set; } = "Normal";
    public List<PickTaskParcelLineDocument> Parcels { get; set; } = [];
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}

internal sealed class PackingTaskDocument
{
    public Guid PackingTaskId { get; set; }
    public Guid ShipmentId { get; set; }
    public string ShipmentDisplayId { get; set; } = "";
    public string Status { get; set; } = "PENDING";
    public string DispatchStagingStatus { get; set; } = "";
    public string CustomerDisplayName { get; set; } = "";
    public string Destination { get; set; } = "Eswatini";
    public string DeliveryMethod { get; set; } = "";
    public int PackageCount { get; set; } = 1;
    public decimal? FinalWeightKg { get; set; }
    public string? FinalDimensionsLabel { get; set; }
    public string? PackagingType { get; set; }
    public bool Sealed { get; set; }
    public decimal? VolumetricWeightKg { get; set; }
    public decimal? ChargeableWeightKg { get; set; }
    public decimal? QuotedWeightKg { get; set; }
    public string VarianceStatus { get; set; } = "NONE";
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}

internal sealed class DispatchManifestDocument
{
    public Guid ManifestId { get; set; }
    public string DisplayId { get; set; } = "";
    public string Courier { get; set; } = "PUDO";
    public DateTime DispatchDate { get; set; }
    public string? PickupWindow { get; set; }
    public string Status { get; set; } = "DRAFT";
    public List<Guid> ShipmentIds { get; set; } = [];
    public string? ProofOfHandover { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? HandedOverAtUtc { get; set; }
}
