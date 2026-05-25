namespace Wayel.Infrastructure.Storage;

public sealed class InvoiceStorageOptions
{
    public const string SectionName = "MediaStorage";

    /// <summary>s3 or in-memory</summary>
    public string Provider { get; init; } = "in-memory";

    public string? Region { get; init; }
    public string? BucketName { get; init; }
    public string? CdnHost { get; init; }
    public string? ServiceUrlOverride { get; init; }
    public bool ForcePathStyle { get; init; }
}
