namespace Wayel.Application.Features.Account;

public sealed record KycDocumentUploadTicketDto(
    Guid DocumentId,
    string Side,
    string UploadUrl,
    IReadOnlyDictionary<string, string> RequiredHeaders,
    DateTime ExpiresAtUtc);

public sealed record KycDocumentDto(
    Guid DocumentId,
    string Side,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTime UploadedAtUtc,
    bool Confirmed,
    string? DownloadUrl);

public sealed record KycVerificationCheckDto(
    string Type,
    string Status,
    string? Detail,
    DateTime? CompletedAtUtc);

public sealed record CustomerKycStatusDto(
    bool Enabled,
    string KycStatus,
    string? RejectionReason,
    bool CanSubmit,
    bool CanUploadDocuments,
    IReadOnlyList<string> RequiredSides,
    IReadOnlyList<KycDocumentDto> Documents,
    IReadOnlyList<KycVerificationCheckDto> Checks,
    DateTime? SubmittedAtUtc,
    int? FaceMatchScore,
    DateTime? IdDocumentExpiryUtc);

public sealed record OpsKycSubmissionDetailDto(
    Guid UserId,
    string Email,
    string DisplayName,
    string Phone,
    string DestinationCountryCode,
    string DestinationCountryLabel,
    string IdDocumentType,
    string IdNumber,
    string KycStatus,
    DateTime? SubmittedAtUtc,
    DateTime? MemberSinceUtc,
    string? SuiteNumber,
    string? RejectionReason,
    string? ReviewerNotes,
    int? FaceMatchScore,
    DateTime? IdDocumentExpiryUtc,
    IReadOnlyList<KycDocumentDto> Documents,
    IReadOnlyList<KycVerificationCheckDto> Checks);

public sealed record KycDocumentFileDto(
    string FileName,
    string ContentType,
    Stream Content);
