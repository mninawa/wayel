using Wayel.Application.Abstractions.Kyc;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Account;
using Wayel.Domain.Users;

namespace Wayel.Application.Kyc;

public sealed class StubKycIdentityProvider(IClock clock) : IKycIdentityProvider
{
    public Task<KycVerificationResult> VerifyAsync(
        User user,
        IReadOnlyList<KycDocumentRecord> documents,
        CancellationToken cancellationToken = default)
    {
        var now = clock.UtcNow;
        var (checks, faceMatch, expiry) = KycVerificationRunner.RunChecks(user, documents, now);
        return Task.FromResult(new KycVerificationResult(
            checks,
            faceMatch,
            expiry,
            ProviderName: "stub",
            ProviderTransactionId: null,
            ProviderDecision: null));
    }
}
