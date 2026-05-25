using MongoDB.Driver;
using Wayel.Application.Abstractions.Storage;
using Wayel.Infrastructure.Persistence.Mongo;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Storage;

internal sealed class MongoKycDocumentUploadSessionStore : IKycDocumentUploadSessionStore
{
    private readonly IMongoCollection<KycDocumentUploadSessionDocument> _collection;
    private static int _indexEnsured;

    public MongoKycDocumentUploadSessionStore(MongoContext context)
    {
        _collection = context.KycDocumentUploadSessions;
        EnsureIndex();
    }

    public void Save(KycDocumentUploadSession session)
    {
        var doc = ToDocument(session);
        _collection.ReplaceOne(
            x => x.DocumentId == session.DocumentId,
            doc,
            new ReplaceOptions { IsUpsert = true });
    }

    public KycDocumentUploadSession? Get(Guid documentId)
    {
        var doc = _collection.Find(x => x.DocumentId == documentId).FirstOrDefault();
        return doc is null ? null : ToRecord(doc);
    }

    public void MarkBytesReceived(Guid documentId)
    {
        _collection.UpdateOne(
            x => x.DocumentId == documentId,
            Builders<KycDocumentUploadSessionDocument>.Update.Set(x => x.BytesReceived, true));
    }

    public void Remove(Guid documentId) =>
        _collection.DeleteOne(x => x.DocumentId == documentId);

    private void EnsureIndex()
    {
        if (Interlocked.Exchange(ref _indexEnsured, 1) != 0)
        {
            return;
        }

        var keys = Builders<KycDocumentUploadSessionDocument>.IndexKeys.Ascending(x => x.ExpiresAtUtc);
        _collection.Indexes.CreateOne(new CreateIndexModel<KycDocumentUploadSessionDocument>(
            keys,
            new CreateIndexOptions { ExpireAfter = TimeSpan.Zero, Name = "ttl_expiresAtUtc" }));
    }

    private static KycDocumentUploadSessionDocument ToDocument(KycDocumentUploadSession s) =>
        new()
        {
            DocumentId = s.DocumentId,
            UserId = s.UserId,
            Side = s.Side,
            FileName = s.FileName,
            ContentType = s.ContentType,
            SizeBytes = s.SizeBytes,
            StorageKey = s.StorageKey,
            ExpiresAtUtc = s.ExpiresAtUtc,
            BytesReceived = s.BytesReceived,
        };

    private static KycDocumentUploadSession ToRecord(KycDocumentUploadSessionDocument d) =>
        new(
            d.DocumentId,
            d.UserId,
            d.Side,
            d.FileName,
            d.ContentType,
            d.SizeBytes,
            d.StorageKey,
            d.ExpiresAtUtc,
            d.BytesReceived);
}
