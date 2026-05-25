using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelOpsMetadataRepository(MongoContext context) : IParcelOpsMetadataRepository
{
    public async Task<ParcelOpsMetadata?> GetForParcelAsync(
        ParcelId parcelId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.ParcelOpsMetadata
            .Find(x => x.ParcelId == parcelId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToDomain(doc);
    }

    public async Task UpsertAsync(ParcelOpsMetadata metadata, CancellationToken cancellationToken = default)
    {
        var doc = FromDomain(metadata);
        await context.ParcelOpsMetadata.ReplaceOneAsync(
            x => x.ParcelId == metadata.ParcelId,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    private static ParcelOpsMetadata ToDomain(ParcelOpsMetadataDocument doc) =>
        new(
            doc.ParcelId,
            doc.WarehouseLocation,
            doc.ConditionStatus,
            doc.InspectionNotes,
            doc.PackagingType,
            doc.OuterPackagingIntact,
            doc.SealIntact,
            doc.LabelReadable,
            doc.GoodsAsDescribed,
            doc.InspectedAtUtc,
            doc.InspectedBy,
            doc.UpdatedAtUtc,
            doc.LocationId,
            doc.WarehouseStatus);

    private static ParcelOpsMetadataDocument FromDomain(ParcelOpsMetadata metadata) =>
        new()
        {
            ParcelId = metadata.ParcelId,
            WarehouseLocation = metadata.WarehouseLocation,
            ConditionStatus = metadata.ConditionStatus,
            InspectionNotes = metadata.InspectionNotes,
            PackagingType = metadata.PackagingType,
            OuterPackagingIntact = metadata.OuterPackagingIntact,
            SealIntact = metadata.SealIntact,
            LabelReadable = metadata.LabelReadable,
            GoodsAsDescribed = metadata.GoodsAsDescribed,
            InspectedAtUtc = metadata.InspectedAtUtc,
            InspectedBy = metadata.InspectedBy,
            UpdatedAtUtc = metadata.UpdatedAtUtc,
            LocationId = metadata.LocationId,
            WarehouseStatus = metadata.WarehouseStatus,
        };
}
