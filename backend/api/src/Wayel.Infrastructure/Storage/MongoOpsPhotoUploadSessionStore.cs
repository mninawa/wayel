using MongoDB.Driver;
using Wayel.Application.Abstractions.Storage;
using Wayel.Infrastructure.Persistence.Mongo;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Storage;

internal sealed class MongoOpsPhotoUploadSessionStore : IOpsPhotoUploadSessionStore
{
    private readonly IMongoCollection<OpsPhotoUploadSessionDocument> _collection;
    private static int _indexEnsured;

    public MongoOpsPhotoUploadSessionStore(MongoContext context)
    {
        _collection = context.OpsPhotoUploadSessions;
        EnsureIndex();
    }

    public void Save(OpsPhotoUploadSession session)
    {
        var doc = ToDocument(session);
        _collection.ReplaceOne(
            x => x.PhotoId == session.PhotoId,
            doc,
            new ReplaceOptions { IsUpsert = true });
    }

    public OpsPhotoUploadSession? Get(Guid photoId)
    {
        var doc = _collection.Find(x => x.PhotoId == photoId).FirstOrDefault();
        if (doc is null)
        {
            return null;
        }

        if (doc.ExpiresAtUtc <= DateTime.UtcNow)
        {
            _collection.DeleteOne(x => x.PhotoId == photoId);
            return null;
        }

        return ToRecord(doc);
    }

    public void MarkBytesReceived(Guid photoId)
    {
        _collection.UpdateOne(
            x => x.PhotoId == photoId,
            Builders<OpsPhotoUploadSessionDocument>.Update.Set(x => x.BytesReceived, true));
    }

    public void Remove(Guid photoId) =>
        _collection.DeleteOne(x => x.PhotoId == photoId);

    private void EnsureIndex()
    {
        if (Interlocked.Exchange(ref _indexEnsured, 1) != 0)
        {
            return;
        }

        var keys = Builders<OpsPhotoUploadSessionDocument>.IndexKeys.Ascending(x => x.ExpiresAtUtc);
        _collection.Indexes.CreateOne(new CreateIndexModel<OpsPhotoUploadSessionDocument>(
            keys,
            new CreateIndexOptions { ExpireAfter = TimeSpan.Zero, Name = "ttl_expiresAtUtc" }));
    }

    private static OpsPhotoUploadSessionDocument ToDocument(OpsPhotoUploadSession s) =>
        new()
        {
            PhotoId = s.PhotoId,
            ParcelId = s.ParcelId,
            Category = s.Category,
            FileName = s.FileName,
            ContentType = s.ContentType,
            SizeBytes = s.SizeBytes,
            StorageKey = s.StorageKey,
            Actor = s.Actor,
            ExpiresAtUtc = s.ExpiresAtUtc,
            BytesReceived = s.BytesReceived,
        };

    private static OpsPhotoUploadSession ToRecord(OpsPhotoUploadSessionDocument d) =>
        new(
            d.PhotoId,
            d.ParcelId,
            d.Category,
            d.FileName,
            d.ContentType,
            d.SizeBytes,
            d.StorageKey,
            d.Actor,
            d.ExpiresAtUtc,
            d.BytesReceived);
}
