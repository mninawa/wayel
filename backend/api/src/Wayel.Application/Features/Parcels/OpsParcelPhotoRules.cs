namespace Wayel.Application.Features.Parcels;

internal static class OpsParcelPhotoRules
{
    internal const long MaxBytes = 12 * 1024 * 1024;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/webp",
    };

    internal static bool CanUploadCategory(string role, string category) =>
        category switch
        {
            "INTAKE" => OpsPermissions.CanIntake(role),
            "INSPECTION" => OpsPermissions.CanInspect(role),
            _ => false,
        };

    internal static string NormalizeCategory(string category) =>
        category.Trim().ToUpperInvariant();

    internal static string NormalizeContentType(string contentType, string fileName)
    {
        var normalized = contentType.Trim();
        if (!string.IsNullOrWhiteSpace(normalized) && normalized != "application/octet-stream")
        {
            return normalized;
        }

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => normalized,
        };
    }

    internal static bool IsAllowedContentType(string contentType) =>
        AllowedContentTypes.Contains(contentType);

    internal static string BuildStorageKey(Guid parcelId, string category, Guid photoId, string fileName)
    {
        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = contentTypeToExtension(NormalizeContentType(string.Empty, fileName));
        }

        return $"ops/photos/{parcelId:N}/{category}/{photoId:N}{ext}";
    }

    private static string contentTypeToExtension(string contentType) =>
        contentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".jpg",
        };
}
