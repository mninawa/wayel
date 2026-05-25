using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Tracking;

namespace Wayel.Api.Endpoints;

/// <summary>Warehouse shipment status updates (records tracking events).</summary>
public sealed class ShipmentOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/shipments")
            .WithTags("WeYell Shipment Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/", async (IMediator mediator, CancellationToken ct, int limit = 50) =>
            (await mediator.Send(new ListOpsShipmentsQuery(limit), ct)).ToHttpResult())
            .WithName("ListOpsShipments");

        group.MapPost("/{shipmentId:guid}/status", async (
            Guid shipmentId,
            UpdateOpsShipmentStatusRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new UpdateOpsShipmentStatusCommand(
                    shipmentId,
                    body.Status,
                    body.Location,
                    body.Details),
                ct)).ToHttpResult())
            .WithName("UpdateOpsShipmentStatus");
    }

    private sealed record UpdateOpsShipmentStatusRequest(
        string Status,
        string? Location,
        string? Details);
}
