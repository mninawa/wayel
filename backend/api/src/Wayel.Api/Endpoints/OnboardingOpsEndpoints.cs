using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Onboarding;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Ops-side endpoints for the onboarding funnel — currently surfacing the
/// "Pay later" cohort. Mounted under <c>/borderbox/ops/onboarding</c> so
/// future onboarding analytics (e.g. profile-complete drop-off) can sit
/// next to it.
/// </summary>
public sealed class OnboardingOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/onboarding")
            .WithTags("WeYell Onboarding Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/pay-later/stats", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetPayLaterStatsQuery(), ct)).ToHttpResult())
            .WithName("GetPayLaterStats")
            .WithSummary("KPIs for the onboarding pay-later funnel");

        group.MapGet("/pay-later", async (
            string? status,
            int? page,
            int? pageSize,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new ListPayLaterIntentsQuery(status, page ?? 1, pageSize ?? 20),
                ct)).ToHttpResult())
            .WithName("ListPayLaterIntents")
            .WithSummary("Paged list of customers who deferred onboarding payment");
    }
}
