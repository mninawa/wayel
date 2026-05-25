using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Collection;

namespace Wayel.Api.Endpoints;

/// <summary>Eswatini collection board — last-mile pickup after RSA dispatch.</summary>
public sealed class CollectionOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/collection")
            .WithTags("WeYell Collection")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/board", async (
            IMediator mediator,
            CancellationToken ct,
            string? search = null,
            string? hubCity = null,
            int limit = 120) =>
            (await mediator.Send(new GetOpsCollectionBoardQuery(search, hubCity, limit), ct)).ToHttpResult())
            .WithName("GetOpsCollectionBoard");

        group.MapPost("/scan-arrival", async (
            ScanArrivalRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new ScanOpsCollectionArrivalCommand(body.ScanValue, body.HubCity), ct)).ToHttpResult())
            .WithName("ScanOpsCollectionArrival");

        group.MapPost("/confirm-pickup", async (
            ConfirmPickupRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new ConfirmOpsCollectionPickupCommand(
                    body.ShipmentId,
                    body.IdDocumentType,
                    body.IdNumber,
                    body.CollectorName),
                ct)).ToHttpResult())
            .WithName("ConfirmOpsCollectionPickup");

        group.MapPost("/board/move", async (
            MoveBoardItemRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new MoveOpsCollectionBoardItemCommand(
                    body.ShipmentId,
                    body.FromColumnId,
                    body.ToColumnId,
                    body.HubCity),
                ct)).ToHttpResult())
            .WithName("MoveOpsCollectionBoardItem");

        group.MapPost("/board/bulk-advance", async (
            BulkAdvanceRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new BulkAdvanceOpsCollectionColumnCommand(body.ColumnId, body.HubCity),
                ct)).ToHttpResult())
            .WithName("BulkAdvanceOpsCollectionColumn");
    }

    private sealed record MoveBoardItemRequest(
        Guid ShipmentId,
        string FromColumnId,
        string ToColumnId,
        string? HubCity);

    private sealed record BulkAdvanceRequest(string ColumnId, string? HubCity);

    private sealed record ScanArrivalRequest(string ScanValue, string? HubCity);

    private sealed record ConfirmPickupRequest(
        Guid ShipmentId,
        string IdDocumentType,
        string IdNumber,
        string? CollectorName);
}
