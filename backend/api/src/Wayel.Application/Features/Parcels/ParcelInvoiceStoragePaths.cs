namespace Wayel.Application.Features.Parcels;

/// <summary>
/// S3 / local object keys under <c>we-yell-courier-platform</c>: one folder per customer suite.
/// Example: <c>WY-24789/invoices/{parcelId}/{fileId}.pdf</c>
/// </summary>
public static class ParcelInvoiceStoragePaths
{
    public static string BuildStorageKey(string suiteNumber, Guid parcelId, string fileExtension)
    {
        var suiteFolder = SanitizeSuiteFolder(suiteNumber);
        var ext = fileExtension.StartsWith('.') ? fileExtension : $".{fileExtension}";
        return $"{suiteFolder}/invoices/{parcelId:D}/{Guid.NewGuid():N}{ext}";
    }

    public static string SanitizeSuiteFolder(string suiteNumber)
    {
        if (string.IsNullOrWhiteSpace(suiteNumber))
        {
            return "unknown-suite";
        }

        var trimmed = suiteNumber.Trim();
        Span<char> buffer = stackalloc char[trimmed.Length];
        var len = 0;
        foreach (var c in trimmed)
        {
            buffer[len++] = char.IsAsciiLetterOrDigit(c) || c is '-' or '_' ? c : '-';
        }

        var sanitized = new string(buffer[..len]).Trim('-');
        return string.IsNullOrEmpty(sanitized) ? "unknown-suite" : sanitized;
    }
}
