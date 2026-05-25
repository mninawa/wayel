namespace Wayel.Application.Features.Account;

using Wayel.Application.Abstractions.Persistence;

public static class KycOpsDocumentUrls
{
    public static string Download(Guid userId, Guid documentId) =>
        $"/api/v1/borderbox/ops/kyc/{userId:D}/documents/{documentId:D}";

    public static IReadOnlyList<KycDocumentDto> MapDocumentDtos(
        Guid userId,
        IReadOnlyList<KycDocumentRecord> documents) =>
        documents
            .Where(d => d.Confirmed)
            .Select(d => new KycDocumentDto(
                d.DocumentId,
                d.Side,
                d.FileName,
                d.ContentType,
                d.SizeBytes,
                d.UploadedAtUtc,
                d.Confirmed,
                Download(userId, d.DocumentId)))
            .ToList();
}
