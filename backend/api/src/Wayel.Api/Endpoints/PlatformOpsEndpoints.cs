using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Api.Endpoints;

public sealed class PlatformOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/platform")
            .WithTags("WeYell Platform Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/dashboard", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsPlatformDashboardQuery(), ct)).ToHttpResult())
            .WithName("GetOpsPlatformDashboard")
            .WithSummary("Platform dashboard metrics from live WeYell data");
    }
}
