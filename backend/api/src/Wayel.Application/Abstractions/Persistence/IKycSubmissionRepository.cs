using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record KycDocumentRecord(
    Guid DocumentId,
    string Side,
    string FileName,
    string ContentType,
    string StorageKey,
    long SizeBytes,
    DateTime UploadedAtUtc,
    bool Confirmed);

public sealed record KycCheckRecord(
    string Type,
    string Status,
    string? Detail,
    DateTime? CompletedAtUtc);

public sealed record KycSubmissionRecord(
    Guid Id,
    Guid UserId,
    string KycStatus,
    DateTime? SubmittedAtUtc,
    DateTime? ReviewedAtUtc,
    string? ReviewedBy,
    string? RejectionReason,
    string? ReviewerNotes,
    DateTime? IdDocumentExpiryUtc,
    int? FaceMatchScore,
    IReadOnlyList<KycDocumentRecord> Documents,
    IReadOnlyList<KycCheckRecord> Checks,
    string? ProviderName = null,
    string? ProviderTransactionId = null);

public interface IKycSubmissionRepository
{
    Task<KycSubmissionRecord?> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default);

    Task UpsertAsync(KycSubmissionRecord submission, CancellationToken cancellationToken = default);
}
