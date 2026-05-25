using Microsoft.Extensions.Hosting;
using Wayel.Application.Abstractions.Storage;

namespace Wayel.Infrastructure.Storage;

internal sealed class InMemoryInvoiceBlobStorage(IHostEnvironment env) : IInvoiceBlobStorage
{
    private string Root => Path.Combine(env.ContentRootPath, "data", "parcel-invoices");

    public async Task<string> PutAsync(
        string storageKey,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(Root, storageKey.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var fs = File.Create(path);
        await content.CopyToAsync(fs, cancellationToken);
        return storageKey;
    }

    public Task<BlobUploadTicket> CreateUploadTicketAsync(
        string storageKey,
        string contentType,
        long sizeBytes,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
    {
        var uploadUrl = ResolveUploadUrl(storageKey);
        var ticket = new BlobUploadTicket(
            uploadUrl,
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["Content-Type"] = contentType,
            },
            DateTime.UtcNow.Add(ttl));
        return Task.FromResult(ticket);
    }

    private static string ResolveUploadUrl(string storageKey)
    {
        if (storageKey.StartsWith("kyc/", StringComparison.OrdinalIgnoreCase))
        {
            var documentId = Path.GetFileNameWithoutExtension(storageKey);
            return $"/api/v1/borderbox/account/kyc/documents/{documentId}/blob";
        }

        if (storageKey.StartsWith("ops/photos/", StringComparison.OrdinalIgnoreCase))
        {
            var photoId = ExtractPhotoId(storageKey);
            return $"/api/v1/borderbox/ops/receiving/photos/{photoId:N}/blob";
        }

        var fallbackId = ExtractPhotoId(storageKey);
        return $"/api/v1/borderbox/ops/receiving/photos/{fallbackId:N}/blob";
    }

    public Task<bool> ExistsAsync(
        string storageKey,
        long? expectedSizeBytes = null,
        CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(Root, storageKey.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(path))
        {
            return Task.FromResult(false);
        }

        if (expectedSizeBytes is null)
        {
            return Task.FromResult(true);
        }

        var info = new FileInfo(path);
        return Task.FromResult(info.Length == expectedSizeBytes.Value);
    }

    public Task<Uri?> GetDownloadUriAsync(string storageKey, CancellationToken cancellationToken = default) =>
        Task.FromResult<Uri?>(null);

    public Task<Stream?> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(Root, storageKey.Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(path))
        {
            return Task.FromResult<Stream?>(null);
        }

        return Task.FromResult<Stream?>((Stream)File.OpenRead(path));
    }

    public Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(Root, storageKey.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private static Guid ExtractPhotoId(string storageKey)
    {
        var fileName = Path.GetFileNameWithoutExtension(storageKey);
        return Guid.TryParse(fileName, out var photoId) ? photoId : Guid.Empty;
    }
}
