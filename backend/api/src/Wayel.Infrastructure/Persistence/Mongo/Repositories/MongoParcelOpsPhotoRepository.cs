using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelOpsPhotoRepository(MongoContext context) : IParcelOpsPhotoRepository
{
    public async Task AddAsync(ParcelOpsPhoto photo, CancellationToken cancellationToken = default)
    {
        var doc = new ParcelOpsPhotoDocument
        {
            Id = photo.Id,
            ParcelId = photo.ParcelId,
            Category = photo.Category,
            FileName = photo.FileName,
            ContentType = photo.ContentType,
            StorageKey = photo.StorageKey,
            UploadedAtUtc = photo.UploadedAtUtc,
            UploadedBy = photo.UploadedBy,
        };
        await context.ParcelOpsPhotos.InsertOneAsync(doc, cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyList<ParcelOpsPhoto>> ListForParcelAsync(
        ParcelId parcelId,
        string? category,
        CancellationToken cancellationToken = default)
    {
        var filter = string.IsNullOrWhiteSpace(category)
            ? Builders<ParcelOpsPhotoDocument>.Filter.Eq(x => x.ParcelId, parcelId)
            : Builders<ParcelOpsPhotoDocument>.Filter.And(
                Builders<ParcelOpsPhotoDocument>.Filter.Eq(x => x.ParcelId, parcelId),
                Builders<ParcelOpsPhotoDocument>.Filter.Eq(x => x.Category, category.Trim().ToUpperInvariant()));

        var docs = await context.ParcelOpsPhotos
            .Find(filter)
            .SortByDescending(x => x.UploadedAtUtc)
            .ToListAsync(cancellationToken);

        return docs.Select(ToDomain).ToList();
    }

    public async Task<ParcelOpsPhoto?> GetByIdAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        var doc = await context.ParcelOpsPhotos.Find(x => x.Id == photoId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToDomain(doc);
    }

    public async Task DeleteAsync(Guid photoId, CancellationToken cancellationToken = default)
    {
        await context.ParcelOpsPhotos.DeleteOneAsync(
            x => x.Id == photoId,
            cancellationToken);
    }

    public async Task<IReadOnlyDictionary<Guid, Guid>> ListLatestPhotoIdByParcelIdsAsync(
        IReadOnlyList<Guid> parcelIds,
        CancellationToken cancellationToken = default)
    {
        if (parcelIds.Count == 0)
        {
            return new Dictionary<Guid, Guid>();
        }

        var ids = parcelIds.Distinct().Select(id => new ParcelId(id)).ToList();
        var filter = Builders<ParcelOpsPhotoDocument>.Filter.In(x => x.ParcelId, ids);
        var docs = await context.ParcelOpsPhotos
            .Find(filter)
            .SortByDescending(x => x.UploadedAtUtc)
            .ToListAsync(cancellationToken);

        var map = new Dictionary<Guid, Guid>();
        foreach (var doc in docs)
        {
            var parcelId = doc.ParcelId.Value;
            map.TryAdd(parcelId, doc.Id);
        }

        return map;
    }

    private static ParcelOpsPhoto ToDomain(ParcelOpsPhotoDocument doc) =>
        new(
            doc.Id,
            doc.ParcelId,
            doc.Category,
            doc.FileName,
            doc.ContentType,
            doc.StorageKey,
            doc.UploadedAtUtc,
            doc.UploadedBy);
}
