namespace Wayel.Application.Abstractions.Storage;

public sealed record BlobUploadTicket(
    string UploadUrl,
    IReadOnlyDictionary<string, string> RequiredHeaders,
    DateTime ExpiresAtUtc);
