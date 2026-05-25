using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Storage;

namespace Wayel.Application.Features.Account;

/// <summary>
/// POPIA / data-minimisation: once a customer's identity is verified we no
/// longer need to retain the photographic ID document. The selfie is kept
/// because ops uses it to confirm the human collecting parcels matches the
/// face on file. Front and back of ID documents are deleted from blob
/// storage and their submission records are redacted so the review UI
/// shows them as purged.
/// </summary>
public static class KycDocumentRetention
{
    public const string SelfieSide = "selfie";

    public static async Task<KycSubmissionRecord> PurgeNonSelfieDocumentsAsync(
        KycSubmissionRecord submission,
        IInvoiceBlobStorage storage,
        ILogger? logger,
        CancellationToken cancellationToken)
    {
        if (submission.Documents.Count == 0)
        {
            return submission;
        }

        var redacted = new List<KycDocumentRecord>(submission.Documents.Count);
        foreach (var doc in submission.Documents)
        {
            if (string.Equals(doc.Side, SelfieSide, StringComparison.OrdinalIgnoreCase))
            {
                redacted.Add(doc);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(doc.StorageKey))
            {
                try
                {
                    await storage.DeleteAsync(doc.StorageKey, cancellationToken);
                }
                catch (Exception ex) when (logger is not null)
                {
                    logger.LogWarning(
                        ex,
                        "Failed to purge KYC document blob {StorageKey} after verification.",
                        doc.StorageKey);
                }
            }

            redacted.Add(doc with
            {
                FileName = $"{doc.Side}.purged",
                StorageKey = string.Empty,
                SizeBytes = 0,
                Confirmed = false,
            });
        }

        return submission with { Documents = redacted };
    }
}
