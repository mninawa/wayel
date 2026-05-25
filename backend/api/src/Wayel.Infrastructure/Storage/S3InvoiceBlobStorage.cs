using System.Globalization;
using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Storage;

namespace Wayel.Infrastructure.Storage;

internal sealed class S3InvoiceBlobStorage(IOptions<InvoiceStorageOptions> options) : IInvoiceBlobStorage
{
    private readonly InvoiceStorageOptions _opts = options.Value;

    public async Task<string> PutAsync(
        string storageKey,
        Stream content,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var client = CreateClient();
        var request = new PutObjectRequest
        {
            BucketName = _opts.BucketName!,
            Key = storageKey,
            InputStream = content,
            ContentType = contentType,
            ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256,
        };
        await client.PutObjectAsync(request, cancellationToken);
        return storageKey;
    }

    public Task<BlobUploadTicket> CreateUploadTicketAsync(
        string storageKey,
        string contentType,
        long sizeBytes,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var client = CreateClient();
        var expiresAt = DateTime.UtcNow.Add(ttl);
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _opts.BucketName!,
            Key = storageKey,
            Verb = HttpVerb.PUT,
            Expires = expiresAt,
            ContentType = contentType,
            ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256,
        };

        var uploadUrl = client.GetPreSignedURL(request);
        IReadOnlyDictionary<string, string> headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Content-Type"] = contentType,
            ["Content-Length"] = sizeBytes.ToString(CultureInfo.InvariantCulture),
            ["x-amz-server-side-encryption"] = "AES256",
        };

        return Task.FromResult(new BlobUploadTicket(uploadUrl, headers, expiresAt));
    }

    public async Task<bool> ExistsAsync(
        string storageKey,
        long? expectedSizeBytes = null,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var client = CreateClient();
        try
        {
            var metadata = await client.GetObjectMetadataAsync(_opts.BucketName!, storageKey, cancellationToken);
            if (expectedSizeBytes is null)
            {
                return true;
            }

            return metadata.ContentLength == expectedSizeBytes.Value;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<Uri?> GetDownloadUriAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(_opts.CdnHost))
        {
            return null;
        }

        var host = _opts.CdnHost!.Trim().TrimEnd('/');
        if (!host.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            host = $"https://{host}";
        }

        return new Uri($"{host}/{storageKey.TrimStart('/')}");
    }

    public async Task<Stream?> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var client = CreateClient();
        try
        {
            var response = await client.GetObjectAsync(_opts.BucketName!, storageKey, cancellationToken);
            var ms = new MemoryStream();
            await response.ResponseStream.CopyToAsync(ms, cancellationToken);
            ms.Position = 0;
            return ms;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        EnsureConfigured();
        using var client = CreateClient();
        try
        {
            await client.DeleteObjectAsync(_opts.BucketName!, storageKey, cancellationToken);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Already removed from bucket.
        }
    }

    private AmazonS3Client CreateClient()
    {
        var config = new AmazonS3Config
        {
            RegionEndpoint = RegionEndpoint.GetBySystemName(_opts.Region!),
            ForcePathStyle = _opts.ForcePathStyle,
        };
        if (!string.IsNullOrWhiteSpace(_opts.ServiceUrlOverride))
        {
            config.ServiceURL = _opts.ServiceUrlOverride;
        }

        return new AmazonS3Client(config);
    }

    private void EnsureConfigured()
    {
        if (string.IsNullOrWhiteSpace(_opts.Region)
            || string.IsNullOrWhiteSpace(_opts.BucketName))
        {
            throw new InvalidOperationException(
                "S3 invoice storage requires MediaStorage__Region and MediaStorage__BucketName.");
        }
    }
}
