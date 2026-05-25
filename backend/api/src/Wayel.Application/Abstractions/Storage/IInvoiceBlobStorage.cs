namespace Wayel.Application.Abstractions.Storage;

public interface IInvoiceBlobStorage
{
    Task<string> PutAsync(
        string storageKey,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<BlobUploadTicket> CreateUploadTicketAsync(
        string storageKey,
        string contentType,
        long sizeBytes,
        TimeSpan ttl,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(
        string storageKey,
        long? expectedSizeBytes = null,
        CancellationToken cancellationToken = default);

    Task<Uri?> GetDownloadUriAsync(string storageKey, CancellationToken cancellationToken = default);

    Task<Stream?> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default);

    Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default);
}
