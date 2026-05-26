using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Api.Endpoints;

public sealed class OpsAuthEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var auth = routes
            .MapGroup("/borderbox/ops/auth")
            .WithTags("WeYell Ops Auth");

        auth.MapPost("/google", async (OpsGoogleSignInRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new OpsSignInGoogleCommand(body.IdToken), ct)).ToHttpResult())
            .AllowAnonymous()
            .WithName("OpsSignInGoogle");

        auth.MapGet("/invitations/preview", async (string token, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new PreviewOpsInvitationQuery(token), ct)).ToHttpResult())
            .AllowAnonymous()
            .WithName("PreviewOpsInvitation");

        var admin = routes
            .MapGroup("/borderbox/ops/admin")
            .WithTags("WeYell Ops Admin")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        admin.MapGet("/users", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListOpsUsersQuery(), ct)).ToHttpResult())
            .WithName("ListOpsUsers");

        admin.MapGet("/invitations", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListOpsInvitationsQuery(), ct)).ToHttpResult())
            .WithName("ListOpsInvitations");

        admin.MapPost("/invitations", async (CreateOpsInvitationRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateOpsInvitationCommand(body.Email, body.Role), ct)).ToHttpResult())
            .WithName("CreateOpsInvitation");

        admin.MapDelete("/invitations/{invitationId:guid}", async (Guid invitationId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new RevokeOpsInvitationCommand(invitationId), ct)).ToHttpResult())
            .WithName("RevokeOpsInvitation");

        admin.MapPatch("/users/{userId:guid}/role", async (
            Guid userId,
            UpdateOpsUserRoleRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new UpdateOpsUserRoleCommand(userId, body.Role), ct)).ToHttpResult())
            .WithName("UpdateOpsUserRole");

        admin.MapPatch("/users/{userId:guid}/disabled", async (
            Guid userId,
            SetOpsUserDisabledRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new SetOpsUserDisabledCommand(userId, body.IsDisabled), ct)).ToHttpResult())
            .WithName("SetOpsUserDisabled");

        admin.MapGet("/audit", async (
            IMediator mediator,
            CancellationToken ct,
            string? action = null,
            int pageSize = 20,
            string? cursor = null) =>
            (await mediator.Send(new ListRecentOpsAuditQuery(action, pageSize, cursor), ct)).ToHttpResult())
            .WithName("ListRecentOpsAudit");
    }

    private sealed record OpsGoogleSignInRequest(string IdToken);
    private sealed record CreateOpsInvitationRequest(string Email, string Role);
    private sealed record UpdateOpsUserRoleRequest(string Role);
    private sealed record SetOpsUserDisabledRequest(bool IsDisabled);
}
