using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record ParcelOpsMetadata(
    ParcelId ParcelId,
    string? WarehouseLocation,
    string ConditionStatus,
    string? InspectionNotes,
    string? PackagingType,
    bool OuterPackagingIntact,
    bool SealIntact,
    bool LabelReadable,
    bool GoodsAsDescribed,
    DateTime? InspectedAtUtc,
    string? InspectedBy,
    DateTime UpdatedAtUtc,
    string? LocationId = null,
    string WarehouseStatus = "NOT_STORED");

public interface IParcelOpsMetadataRepository
{
    Task<ParcelOpsMetadata?> GetForParcelAsync(ParcelId parcelId, CancellationToken cancellationToken = default);
    Task UpsertAsync(ParcelOpsMetadata metadata, CancellationToken cancellationToken = default);
}
