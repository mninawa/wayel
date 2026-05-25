using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Parcels;

namespace Wayel.Api.Endpoints;

/// <summary>Warehouse consolidation — inventory, storage assignment, dispatch staging.</summary>
public sealed class ConsolidationOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/consolidation")
            .WithTags("WeYell Warehouse Consolidation")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/inventory", async (
            IMediator mediator,
            CancellationToken ct,
            int page = 1,
            int pageSize = 25,
            string? suite = null,
            string? location = null) =>
            (await mediator.Send(
                new ListOpsConsolidationInventoryQuery(page, pageSize, suite, location),
                ct)).ToHttpResult())
            .WithName("ListOpsConsolidationInventory");

        group.MapPatch("/parcels/{parcelId:guid}/location", async (
            Guid parcelId,
            UpdateStorageLocationRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new UpdateOpsParcelStorageLocationCommand(parcelId, body.WarehouseLocation),
                ct)).ToHttpResult())
            .WithName("UpdateOpsParcelStorageLocation");

        group.MapGet("/ready-shipments", async (
            IMediator mediator,
            CancellationToken ct,
            int page = 1,
            int pageSize = 25,
            string? stage = null) =>
            (await mediator.Send(
                new ListOpsConsolidationReadyShipmentsQuery(page, pageSize, stage),
                ct)).ToHttpResult())
            .WithName("ListOpsConsolidationReadyShipments");

        group.MapPost("/shipments/{shipmentId:guid}/mark-packed", async (
            Guid shipmentId,
            MarkPackedRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new MarkOpsConsolidationShipmentPackedCommand(shipmentId, body.Notes),
                ct)).ToHttpResult())
            .WithName("MarkOpsConsolidationShipmentPacked");

        group.MapPost("/dispatch-batch", async (
            DispatchBatchRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new CreateOpsConsolidationDispatchBatchCommand(body.ShipmentIds, body.CourierReference),
                ct)).ToHttpResult())
            .WithName("CreateOpsConsolidationDispatchBatch");
    }

    private sealed record UpdateStorageLocationRequest(string? WarehouseLocation);
    private sealed record MarkPackedRequest(string? Notes);
    private sealed record DispatchBatchRequest(IReadOnlyList<Guid> ShipmentIds, string? CourierReference);
}
