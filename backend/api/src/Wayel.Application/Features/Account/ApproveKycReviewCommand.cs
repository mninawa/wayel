using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record ApproveKycReviewCommand(Guid UserId, string? ReviewerNotes = null)
    : ICommand<KycReviewActionResultDto>;

internal sealed class ApproveKycReviewCommandHandler(
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IInvoiceBlobStorage storage,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<ApproveKycReviewCommandHandler> logger) : ICommandHandler<ApproveKycReviewCommand, KycReviewActionResultDto>
{
    public async Task<Result<KycReviewActionResultDto>> Handle(
        ApproveKycReviewCommand request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("user.not_found", "Customer not found.");
        }

        if (user.KycStatus == KycStatus.Verified)
        {
            return new KycReviewActionResultDto(user.Id.Value, user.KycStatus.ToString(), "Already verified.");
        }

        if (user.KycStatus != KycStatus.Pending)
        {
            return Error.Validation(
                "kyc.not_pending",
                $"Cannot approve KYC while status is {user.KycStatus}.");
        }

        var now = clock.UtcNow;
        user.MarkKycVerified(now);
        await users.UpdateAsync(user, cancellationToken);

        var submission = await submissions.GetForUserAsync(userId, cancellationToken);
        if (submission is not null)
        {
            var updated = submission with
            {
                KycStatus = user.KycStatus.ToString(),
                ReviewedAtUtc = now,
                ReviewerNotes = string.IsNullOrWhiteSpace(request.ReviewerNotes)
                    ? submission.ReviewerNotes
                    : request.ReviewerNotes.Trim(),
                RejectionReason = null,
            };

            updated = await KycDocumentRetention.PurgeNonSelfieDocumentsAsync(
                updated,
                storage,
                logger,
                cancellationToken);

            await submissions.UpsertAsync(updated, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new KycReviewActionResultDto(
            user.Id.Value,
            user.KycStatus.ToString(),
            "KYC approved. Customer can use all account features.");
    }
}
