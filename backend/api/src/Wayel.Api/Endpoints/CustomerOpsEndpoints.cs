using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Account;
using Wayel.Application.Features.SuitePlans;
using Wayel.Application.Features.SuiteSubscriptions;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Ops customer account and suite management (search, profile, subscription view).
/// </summary>
public sealed class CustomerOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/accounts")
            .WithTags("WeYell Account Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/", async (
            string? search,
            string? kycStatus,
            string? country,
            string? suiteStatus,
            int? page,
            int? pageSize,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new ListOpsCustomerAccountsQuery(
                    search,
                    kycStatus,
                    country,
                    suiteStatus,
                    page ?? 1,
                    pageSize ?? 25),
                ct)).ToHttpResult())
            .WithName("ListOpsCustomerAccounts");

        group.MapGet("/{userId:guid}", async (Guid userId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsCustomerAccountQuery(userId), ct)).ToHttpResult())
            .WithName("GetOpsCustomerAccount");

        // Hard-delete a customer and every row they own. Requires the caller
        // to type the customer's email (matched case-insensitively) as a
        // confirmation token to prevent fat-finger deletions. Sent as a
        // query param to dodge DELETE-body interop issues across clients.
        group.MapDelete("/{userId:guid}", async (
            Guid userId,
            string confirmEmail,
            IMediator mediator,
            CancellationToken ct) =>
                (await mediator.Send(
                    new DeleteOpsCustomerAccountCommand(userId, confirmEmail),
                    ct)).ToHttpResult())
            .WithName("DeleteOpsCustomerAccount");

        group.MapGet("/{userId:guid}/suite-payments", async (
            Guid userId,
            IMediator mediator,
            CancellationToken ct) =>
                (await mediator.Send(new GetOpsSuitePaymentsOverviewQuery(userId), ct)).ToHttpResult())
            .WithName("GetOpsCustomerSuitePayments");

        group.MapGet("/{userId:guid}/address-activity", async (
            Guid userId,
            int? limit,
            IMediator mediator,
            CancellationToken ct) =>
                (await mediator.Send(new GetCustomerAddressActivityQuery(userId, limit ?? 20), ct)).ToHttpResult())
            .WithName("GetOpsCustomerAddressActivity");

        // Ops-side mirror of GET /borderbox/suite-plans (active only). The
        // customer endpoint requires a signed-in customer; ops staff carry the
        // ops-key header and never hold a customer session, so we expose the
        // same list here for the account-detail plan picker.
        group.MapGet("/suite-plans", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListSuitePlansQuery(), ct)).ToHttpResult())
            .WithName("ListOpsSuitePlans");
    }
}

/// <summary>
/// Ops admin endpoints to manage the suite plan catalogue (create/update/archive).
/// Mounted on a sibling group so it doesn't collide with the customer-facing
/// <c>/borderbox/suite-plans</c> route.
/// </summary>
public sealed class SuitePlansOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/plans")
            .WithTags("WeYell Suite Plans Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListAllSuitePlansQuery(), ct)).ToHttpResult())
            .WithName("ListAllSuitePlansOps")
            .WithSummary("List all suite plans (including archived) for admin management");

        group.MapPost("/", async (CreatePlanRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new CreateSuitePlanCommand(body.Name, body.DurationMonths, body.PriceZar, body.IsRecommended),
                ct)).ToHttpResult())
            .WithName("CreateSuitePlanOps");

        group.MapPut("/{planId:guid}", async (
            Guid planId,
            UpdatePlanRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new UpdateSuitePlanCommand(planId, body.Name, body.DurationMonths, body.PriceZar, body.IsRecommended),
                ct)).ToHttpResult())
            .WithName("UpdateSuitePlanOps");

        group.MapPost("/{planId:guid}/activate", async (Guid planId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new SetSuitePlanActiveCommand(planId, true), ct)).ToHttpResult())
            .WithName("ActivateSuitePlanOps");

        group.MapPost("/{planId:guid}/deactivate", async (Guid planId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new SetSuitePlanActiveCommand(planId, false), ct)).ToHttpResult())
            .WithName("DeactivateSuitePlanOps");
    }

    private sealed record CreatePlanRequest(string Name, int DurationMonths, decimal PriceZar, bool IsRecommended);

    private sealed record UpdatePlanRequest(string Name, int DurationMonths, decimal PriceZar, bool IsRecommended);
}
