namespace Wayel.Application.Features.Account;

public sealed record PendingKycReviewDto(
    Guid UserId,
    string Email,
    string DisplayName,
    string Phone,
    string IdDocumentType,
    string IdNumber,
    string KycStatus,
    DateTime SubmittedOnUtc,
    string RiskLevel);

public sealed record KycReviewActionResultDto(
    Guid UserId,
    string KycStatus,
    string Message);
