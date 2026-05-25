namespace Wayel.Application.Abstractions.Storage;

public sealed record OpsPhotoUploadSession(
    Guid PhotoId,
    Guid ParcelId,
    string Category,
    string FileName,
    string ContentType,
    long SizeBytes,
    string StorageKey,
    string Actor,
    DateTime ExpiresAtUtc,
    bool BytesReceived);

public interface IOpsPhotoUploadSessionStore
{
    void Save(OpsPhotoUploadSession session);

    OpsPhotoUploadSession? Get(Guid photoId);

    void MarkBytesReceived(Guid photoId);

    void Remove(Guid photoId);
}
