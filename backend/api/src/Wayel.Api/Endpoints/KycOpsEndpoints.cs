using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Account;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Internal KYC review queue (manual approve/reject). Secured with
/// <c>X-Wayel-Ops-Key</c> — see <c>Kyc:OpsApiKey</c> configuration.
/// </summary>
public sealed class KycOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/kyc")
            .WithTags("WeYell KYC Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/pending", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListPendingKycReviewsQuery(), ct)).ToHttpResult())
            .WithName("ListPendingKycReviews");

        group.MapGet("/{userId:guid}", async (Guid userId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsKycSubmissionDetailQuery(userId), ct)).ToHttpResult())
            .WithName("GetOpsKycSubmissionDetail");

        group.MapGet("/{userId:guid}/documents/{documentId:guid}", async (
            Guid userId,
            Guid documentId,
            IMediator mediator,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(new DownloadOpsKycDocumentQuery(userId, documentId), ct);
            if (result.IsFailure)
            {
                return result.ToHttpResult();
            }

            var file = result.Value;
            return Results.File(file.Content, file.ContentType, file.FileName);
        }).WithName("DownloadOpsKycDocument");

        group.MapPost("/{userId:guid}/run-checks", async (Guid userId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new RunOpsKycVerificationChecksCommand(userId), ct)).ToHttpResult())
            .WithName("RunOpsKycVerificationChecks");

        group.MapPost("/{userId:guid}/approve", async (
            Guid userId,
            ApproveKycRequest? body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new ApproveKycReviewCommand(userId, body?.ReviewerNotes), ct)).ToHttpResult())
            .WithName("ApproveKycReview");

        group.MapPost("/{userId:guid}/reject", async (
            Guid userId,
            RejectKycRequest? body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new RejectKycReviewCommand(userId, body?.Reason, body?.ReviewerNotes),
                ct)).ToHttpResult())
            .WithName("RejectKycReview");
    }

    private sealed record ApproveKycRequest(string? ReviewerNotes);

    private sealed record RejectKycRequest(string? Reason, string? ReviewerNotes);
}
