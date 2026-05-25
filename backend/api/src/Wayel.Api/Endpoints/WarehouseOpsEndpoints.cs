using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Warehouse;

namespace Wayel.Api.Endpoints;

/// <summary>Warehouse module — locations, movements, picking, packing, dispatch.</summary>
public sealed class WarehouseOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/warehouse")
            .WithTags("WeYell Warehouse")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/dashboard", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsWarehouseDashboardQuery(), ct)).ToHttpResult())
            .WithName("GetOpsWarehouseDashboard");

        group.MapGet("/board", async (
            IMediator mediator, CancellationToken ct,
            string? search = null, string? destination = null, string? service = null, int limit = 120) =>
            (await mediator.Send(new GetOpsWarehouseBoardQuery(search, destination, service, limit), ct)).ToHttpResult())
            .WithName("GetOpsWarehouseBoard");

        group.MapGet("/board/transitions", async (
            IMediator mediator, CancellationToken ct, string cardKey, string fromColumnId) =>
            (await mediator.Send(new GetOpsWarehouseBoardTransitionsQuery(cardKey, fromColumnId), ct)).ToHttpResult())
            .WithName("GetOpsWarehouseBoardTransitions");

        group.MapPost("/board/move", async (MoveBoardItemRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new MoveOpsWarehouseBoardItemCommand(
                body.CardKey, body.FromColumnId, body.ToColumnId, body.LocationId, body.Reason), ct)).ToHttpResult())
            .WithName("MoveOpsWarehouseBoardItem");

        group.MapGet("/locations", async (
            IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25,
            string? zone = null, string? status = null, string? search = null) =>
            (await mediator.Send(new ListOpsWarehouseLocationsQuery(page, pageSize, zone, status, search), ct)).ToHttpResult())
            .WithName("ListOpsWarehouseLocations");

        group.MapPost("/locations", async (CreateLocationRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateOpsWarehouseLocationCommand(
                body.Zone, body.Aisle, body.Shelf, body.Bin, body.Capacity, body.StorageType, body.Status), ct)).ToHttpResult())
            .WithName("CreateOpsWarehouseLocation");

        group.MapPatch("/locations/{locationId}", async (
            string locationId, UpdateLocationRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new UpdateOpsWarehouseLocationCommand(
                locationId, body.Capacity, body.StorageType, body.Status), ct)).ToHttpResult())
            .WithName("UpdateOpsWarehouseLocation");

        group.MapGet("/movements", async (
            IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25,
            Guid? parcelId = null, string? movementType = null, DateTime? fromUtc = null, DateTime? toUtc = null) =>
            (await mediator.Send(new ListOpsWarehouseMovementsQuery(page, pageSize, parcelId, movementType, fromUtc, toUtc), ct)).ToHttpResult())
            .WithName("ListOpsWarehouseMovements");

        group.MapPost("/movements", async (CreateMovementRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateOpsWarehouseMovementCommand(
                body.ParcelId, body.ToLocationId, body.MovementType, body.Notes), ct)).ToHttpResult())
            .WithName("CreateOpsWarehouseMovement");

        group.MapGet("/storage/{parcelId:guid}", async (Guid parcelId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsParcelStorageQuery(parcelId), ct)).ToHttpResult())
            .WithName("GetOpsParcelStorage");

        group.MapPost("/storage/{parcelId:guid}/assign", async (
            Guid parcelId, AssignStorageRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new AssignOpsParcelStorageCommand(parcelId, body.LocationId, body.Notes), ct)).ToHttpResult())
            .WithName("AssignOpsParcelStorage");

        group.MapGet("/picking-tasks", async (
            IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25, string? status = null) =>
            (await mediator.Send(new ListOpsPickTasksQuery(page, pageSize, status), ct)).ToHttpResult())
            .WithName("ListOpsPickTasks");

        group.MapGet("/picking-tasks/{taskId:guid}", async (Guid taskId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsPickTaskQuery(taskId), ct)).ToHttpResult())
            .WithName("GetOpsPickTask");

        group.MapPost("/picking-tasks/{taskId:guid}/mark-picked", async (
            Guid taskId, MarkPickedRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new MarkOpsPickTaskParcelPickedCommand(taskId, body.ParcelId, body.IssueReason), ct)).ToHttpResult())
            .WithName("MarkOpsPickTaskParcelPicked");

        group.MapGet("/packing-tasks", async (
            IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25, string? status = null) =>
            (await mediator.Send(new ListOpsPackingTasksQuery(page, pageSize, status), ct)).ToHttpResult())
            .WithName("ListOpsPackingTasks");

        group.MapGet("/packing-tasks/{taskId:guid}", async (Guid taskId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsPackingTaskQuery(taskId), ct)).ToHttpResult())
            .WithName("GetOpsPackingTask");

        group.MapPost("/packing-tasks/{taskId:guid}/complete", async (
            Guid taskId, CompletePackingRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CompleteOpsPackingTaskCommand(
                taskId, body.FinalWeightKg, body.FinalDimensionsLabel, body.PackagingType,
                body.PackageCount ?? 1, body.Notes), ct)).ToHttpResult())
            .WithName("CompleteOpsPackingTask");

        group.MapGet("/dispatch-staging", async (
            IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25, string? status = null) =>
            (await mediator.Send(new ListOpsDispatchStagingQuery(page, pageSize, status), ct)).ToHttpResult())
            .WithName("ListOpsDispatchStaging");

        group.MapGet("/manifests", async (IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25) =>
            (await mediator.Send(new ListOpsDispatchManifestsQuery(page, pageSize), ct)).ToHttpResult())
            .WithName("ListOpsDispatchManifests");

        group.MapGet("/manifests/{manifestId:guid}", async (
            Guid manifestId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsDispatchManifestDetailQuery(manifestId), ct)).ToHttpResult())
            .WithName("GetOpsDispatchManifestDetail");

        group.MapPost("/manifests", async (CreateManifestRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateOpsDispatchManifestCommand(
                body.Courier, body.DispatchDate, body.PickupWindow, body.ShipmentIds), ct)).ToHttpResult())
            .WithName("CreateOpsDispatchManifest");

        group.MapPost("/manifests/{manifestId:guid}/confirm-handover", async (
            Guid manifestId, ConfirmHandoverRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ConfirmOpsManifestHandoverCommand(manifestId, body.ProofOfHandover), ct)).ToHttpResult())
            .WithName("ConfirmOpsManifestHandover");

        group.MapPost("/shipments/{shipmentId:guid}/dispatch", async (
            Guid shipmentId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new DispatchOpsShipmentCommand(shipmentId), ct)).ToHttpResult())
            .WithName("DispatchOpsWarehouseShipment");
    }

    private sealed record CreateLocationRequest(string Zone, string Aisle, string Shelf, string Bin, int Capacity, string StorageType, string? Status);
    private sealed record UpdateLocationRequest(int? Capacity, string? StorageType, string? Status);
    private sealed record CreateMovementRequest(Guid ParcelId, string ToLocationId, string MovementType, string? Notes);
    private sealed record AssignStorageRequest(string LocationId, string? Notes);
    private sealed record MarkPickedRequest(Guid ParcelId, string? IssueReason);
    private sealed record CompletePackingRequest(decimal FinalWeightKg, string FinalDimensionsLabel, string PackagingType, int? PackageCount, string? Notes);
    private sealed record CreateManifestRequest(string Courier, DateTime DispatchDate, string? PickupWindow, IReadOnlyList<Guid> ShipmentIds);
    private sealed record ConfirmHandoverRequest(string? ProofOfHandover);
    private sealed record MoveBoardItemRequest(
        string CardKey,
        string FromColumnId,
        string ToColumnId,
        string? LocationId,
        string? Reason);
}
