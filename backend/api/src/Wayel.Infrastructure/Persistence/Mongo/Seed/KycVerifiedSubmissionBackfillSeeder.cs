using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Features.Account;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Ensures verified customers have KYC submission records and demo document files for ops review UI.
/// </summary>
internal sealed class KycVerifiedSubmissionBackfillSeeder(
    MongoContext context,
    IServiceScopeFactory scopeFactory,
    ILogger<KycVerifiedSubmissionBackfillSeeder> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(KycVerifiedSubmissionBackfillSeeder),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var submissions = scope.ServiceProvider.GetRequiredService<IKycSubmissionRepository>();
        var storage = scope.ServiceProvider.GetRequiredService<IInvoiceBlobStorage>();

        var verifiedUsers = await context.Users
            .Find(x => x.KycStatus == KycStatus.Verified)
            .ToListAsync(cancellationToken);

        var backfilled = 0;
        foreach (var userDoc in verifiedUsers)
        {
            var user = userDoc.ToDomain();
            var existing = await submissions.GetForUserAsync(user.Id, cancellationToken);
            if (existing is { Documents.Count: > 0 })
            {
                await EnsureDocumentFilesAsync(existing.Documents, storage, cancellationToken);
                continue;
            }

            var now = DateTime.UtcNow;
            var submittedAt = existing?.SubmittedAtUtc ?? user.KycVerifiedAtUtc ?? user.CreatedOnUtc;
            var documents = await BuildDemoDocumentsAsync(user.Id.Value, user.IdDocumentType, storage, cancellationToken);
            var (checks, faceMatch, expiry) = KycVerificationRunner.RunChecks(user, documents, now);

            await submissions.UpsertAsync(
                new KycSubmissionRecord(
                    existing?.Id ?? Guid.NewGuid(),
                    user.Id.Value,
                    user.KycStatus.ToString(),
                    submittedAt,
                    existing?.ReviewedAtUtc ?? user.KycVerifiedAtUtc ?? submittedAt,
                    existing?.ReviewedBy ?? "demo-seed",
                    null,
                    existing?.ReviewerNotes,
                    expiry,
                    faceMatch,
                    documents,
                    checks),
                cancellationToken);
            backfilled++;
        }

        if (backfilled > 0)
        {
            logger.LogInformation(
                "Backfilled KYC submissions with demo documents for {Count} verified customer(s).",
                backfilled);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task<IReadOnlyList<KycDocumentRecord>> BuildDemoDocumentsAsync(
        Guid userId,
        string idDocumentType,
        IInvoiceBlobStorage storage,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var documents = new List<KycDocumentRecord>();
        foreach (var side in KycDocumentRules.RequiredSides(idDocumentType))
        {
            var documentId = Guid.NewGuid();
            var fileName = $"{side}.png";
            var storageKey = KycDocumentRules.BuildStorageKey(userId, documentId, side, fileName);
            var bytes = KycDemoPlaceholderImages.ForSide(side);
            await using var stream = new MemoryStream(bytes);
            await storage.PutAsync(storageKey, stream, "image/png", cancellationToken);
            documents.Add(new KycDocumentRecord(
                documentId,
                side,
                fileName,
                "image/png",
                storageKey,
                bytes.Length,
                now,
                true));
        }

        return documents;
    }

    private static async Task EnsureDocumentFilesAsync(
        IReadOnlyList<KycDocumentRecord> documents,
        IInvoiceBlobStorage storage,
        CancellationToken cancellationToken)
    {
        foreach (var doc in documents.Where(d => d.Confirmed))
        {
            if (await storage.ExistsAsync(doc.StorageKey, doc.SizeBytes, cancellationToken))
            {
                continue;
            }

            var bytes = KycDemoPlaceholderImages.ForSide(doc.Side);
            await using var stream = new MemoryStream(bytes);
            await storage.PutAsync(doc.StorageKey, stream, doc.ContentType, cancellationToken);
        }
    }
}
