using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Kyc;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record SubmitKycVerificationCommand : ICommand<CustomerAccountResponse>;

internal sealed class SubmitKycVerificationCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IKycIdentityProvider kycProvider,
    IInvoiceBlobStorage storage,
    IUnitOfWork unitOfWork,
    IOptions<KycOptions> kycOptions,
    IClock clock,
    ILogger<SubmitKycVerificationCommandHandler> logger,
    CustomerAccountResponseBuilder accountResponse) : ICommandHandler<SubmitKycVerificationCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        SubmitKycVerificationCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (!CustomerProfileRules.IsComplete(user))
        {
            return Error.Validation(
                "kyc.profile_incomplete",
                "Complete your profile (including ID document and number) before starting KYC.");
        }

        var submission = await submissions.GetForUserAsync(user.Id, cancellationToken);
        var required = KycDocumentRules.RequiredSides(user.IdDocumentType);
        var confirmed = submission?.Documents.Where(d => d.Confirmed).ToList() ?? [];
        var missing = required.Where(side => confirmed.All(d => d.Side != side)).ToList();
        if (missing.Count > 0)
        {
            return Error.Validation(
                "kyc.documents_missing",
                $"Upload all required documents before submitting: {string.Join(", ", missing)}.");
        }

        var submit = user.SubmitKycForReview();
        if (submit.IsFailure)
        {
            return Result.Failure<CustomerAccountResponse>(submit.Error);
        }

        var now = clock.UtcNow;
        var verification = await kycProvider.VerifyAsync(user, confirmed, cancellationToken);

        if (kycOptions.Value.AutoVerifyOnSubmit
            || (kycOptions.Value.AutoApproveOnProviderPass
                && string.Equals(verification.ProviderDecision, "accept", StringComparison.OrdinalIgnoreCase)))
        {
            user.MarkKycVerified(now);
        }

        await users.UpdateAsync(user, cancellationToken);

        var record = new KycSubmissionRecord(
            submission?.Id ?? Guid.NewGuid(),
            user.Id.Value,
            user.KycStatus.ToString(),
            now,
            kycOptions.Value.AutoVerifyOnSubmit ? now : submission?.ReviewedAtUtc,
            submission?.ReviewedBy,
            null,
            submission?.ReviewerNotes,
            verification.IdDocumentExpiryUtc,
            verification.FaceMatchScore,
            confirmed,
            verification.Checks,
            verification.ProviderName,
            verification.ProviderTransactionId);

        if (user.KycStatus == KycStatus.Verified)
        {
            record = await KycDocumentRetention.PurgeNonSelfieDocumentsAsync(
                record,
                storage,
                logger,
                cancellationToken);
        }

        await submissions.UpsertAsync(record, cancellationToken);

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return await accountResponse.BuildAsync(user, cancellationToken);
    }
}
