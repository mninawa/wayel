using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record RejectKycReviewCommand(Guid UserId, string? Reason, string? ReviewerNotes = null)
    : ICommand<KycReviewActionResultDto>;

internal sealed class RejectKycReviewCommandHandler(
    IUserRepository users,
    IKycSubmissionRepository submissions,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<RejectKycReviewCommand, KycReviewActionResultDto>
{
    public async Task<Result<KycReviewActionResultDto>> Handle(
        RejectKycReviewCommand request,
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
            return Error.Validation("kyc.already_verified", "Cannot reject a verified customer.");
        }

        if (user.KycStatus != KycStatus.Pending)
        {
            return Error.Validation(
                "kyc.not_pending",
                $"Cannot reject KYC while status is {user.KycStatus}.");
        }

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        user.MarkKycRejected(reason);
        await users.UpdateAsync(user, cancellationToken);

        var now = clock.UtcNow;
        var submission = await submissions.GetForUserAsync(userId, cancellationToken);
        if (submission is not null)
        {
            await submissions.UpsertAsync(
                submission with
                {
                    KycStatus = user.KycStatus.ToString(),
                    ReviewedAtUtc = now,
                    RejectionReason = reason,
                    ReviewerNotes = string.IsNullOrWhiteSpace(request.ReviewerNotes)
                        ? submission.ReviewerNotes
                        : request.ReviewerNotes.Trim(),
                },
                cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new KycReviewActionResultDto(
            user.Id.Value,
            user.KycStatus.ToString(),
            reason ?? "KYC rejected. Customer may resubmit from My Address.");
    }
}
