namespace Wayel.Application.Abstractions.Storage;

public sealed record KycDocumentUploadSession(
    Guid DocumentId,
    Guid UserId,
    string Side,
    string FileName,
    string ContentType,
    long SizeBytes,
    string StorageKey,
    DateTime ExpiresAtUtc,
    bool BytesReceived);

public interface IKycDocumentUploadSessionStore
{
    void Save(KycDocumentUploadSession session);

    KycDocumentUploadSession? Get(Guid documentId);

    void MarkBytesReceived(Guid documentId);

    void Remove(Guid documentId);
}
