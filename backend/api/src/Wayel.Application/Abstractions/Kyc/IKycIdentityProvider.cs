using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Kyc;

public sealed record KycVerificationResult(
    IReadOnlyList<KycCheckRecord> Checks,
    int? FaceMatchScore,
    DateTime? IdDocumentExpiryUtc,
    string? ProviderName,
    string? ProviderTransactionId,
    string? ProviderDecision);

public interface IKycIdentityProvider
{
    Task<KycVerificationResult> VerifyAsync(
        User user,
        IReadOnlyList<KycDocumentRecord> documents,
        CancellationToken cancellationToken = default);
}
