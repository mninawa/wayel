using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoKycSubmissionRepository(MongoContext context) : IKycSubmissionRepository
{
    public async Task<KycSubmissionRecord?> GetForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.KycSubmissions
            .Find(x => x.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task UpsertAsync(
        KycSubmissionRecord submission,
        CancellationToken cancellationToken = default)
    {
        var doc = ToDocument(submission);
        await context.KycSubmissions.ReplaceOneAsync(
            x => x.UserId == new UserId(submission.UserId),
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    private static KycSubmissionRecord ToRecord(KycSubmissionDocument doc) =>
        new(
            doc.Id,
            doc.UserId.Value,
            doc.KycStatus.ToString(),
            doc.SubmittedAtUtc,
            doc.ReviewedAtUtc,
            doc.ReviewedBy,
            doc.RejectionReason,
            doc.ReviewerNotes,
            doc.IdDocumentExpiryUtc,
            doc.FaceMatchScore,
            doc.Documents.Select(d => new KycDocumentRecord(
                d.DocumentId,
                d.Side,
                d.FileName,
                d.ContentType,
                d.StorageKey,
                d.SizeBytes,
                d.UploadedAtUtc,
                d.Confirmed)).ToList(),
            doc.Checks.Select(c => new KycCheckRecord(
                c.Type,
                c.Status,
                c.Detail,
                c.CompletedAtUtc)).ToList(),
            doc.ProviderName,
            doc.ProviderTransactionId);

    private static KycSubmissionDocument ToDocument(KycSubmissionRecord record)
    {
        Enum.TryParse<KycStatus>(record.KycStatus, true, out var status);
        return new KycSubmissionDocument
        {
            Id = record.Id,
            UserId = new UserId(record.UserId),
            KycStatus = status,
            SubmittedAtUtc = record.SubmittedAtUtc,
            ReviewedAtUtc = record.ReviewedAtUtc,
            ReviewedBy = record.ReviewedBy,
            RejectionReason = record.RejectionReason,
            ReviewerNotes = record.ReviewerNotes,
            IdDocumentExpiryUtc = record.IdDocumentExpiryUtc,
            FaceMatchScore = record.FaceMatchScore,
            ProviderName = record.ProviderName,
            ProviderTransactionId = record.ProviderTransactionId,
            Documents = record.Documents.Select(d => new KycDocumentEntryDocument
            {
                DocumentId = d.DocumentId,
                Side = d.Side,
                FileName = d.FileName,
                ContentType = d.ContentType,
                StorageKey = d.StorageKey,
                SizeBytes = d.SizeBytes,
                UploadedAtUtc = d.UploadedAtUtc,
                Confirmed = d.Confirmed,
            }).ToList(),
            Checks = record.Checks.Select(c => new KycCheckEntryDocument
            {
                Type = c.Type,
                Status = c.Status,
                Detail = c.Detail,
                CompletedAtUtc = c.CompletedAtUtc,
            }).ToList(),
        };
    }
}
