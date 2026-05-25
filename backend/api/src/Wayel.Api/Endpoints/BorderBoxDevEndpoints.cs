using MediatR;
using Microsoft.Extensions.Options;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Seed;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Local/test helpers for customer portal flows. Disabled unless <c>Seed:TestParcels:Enabled</c> is true.
/// </summary>
public sealed class BorderBoxDevEndpoints(IOptions<TestParcelSeedOptions> options) : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        var group = routes
            .MapGroup("/borderbox/dev")
            .WithTags("WeYell Dev")
            .RequireAuthorization();

        group.MapPost("/seed-shippable-parcels", async (
            SeedShippableParcelsRequest? body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new SeedShippableTestParcelsCommand(body?.Dataset),
                ct)).ToHttpResult())
            .WithName("SeedShippableTestParcels")
            .WithSummary("Create sample ready-to-ship parcels (catalog-a or catalog-b) for the signed-in customer");
    }

    private sealed record SeedShippableParcelsRequest(string? Dataset);
}
