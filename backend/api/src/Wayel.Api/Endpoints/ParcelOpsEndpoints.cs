using System.Text.Json.Serialization;
using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Parcels;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Warehouse parcel intake — scan a customer's SA suite and register a received parcel.
/// Secured with <c>X-Wayel-Ops-Key</c> (same as KYC ops).
/// </summary>
public sealed class ParcelOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/parcels")
            .WithTags("WeYell Parcel Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/suite-lookup/{suiteNumber}", async (string suiteNumber, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new LookupSuiteForReceiveQuery(suiteNumber), ct)).ToHttpResult())
            .WithName("LookupSuiteForParcelReceive")
            .WithSummary("Resolve a suite number to the owning customer (warehouse verification)");

        group.MapPost("/receive", async (ReceiveParcelRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new ReceiveParcelCommand(
                    body.SuiteNumber,
                    body.Retailer,
                    body.TrackingNumber,
                    body.ItemName,
                    body.Category,
                    body.DeclaredValueZar,
                    body.DimensionsLabel,
                    body.WeightKg),
                ct)).ToHttpResult())
            .WithName("ReceiveParcelAtWarehouse")
            .WithSummary("Register a parcel received at the Johannesburg warehouse");
    }

    private sealed record ReceiveParcelRequest(
        [property: JsonPropertyName("suiteNumber")] string SuiteNumber,
        string Retailer,
        string? TrackingNumber,
        string ItemName,
        string Category,
        decimal? DeclaredValueZar,
        string? DimensionsLabel,
        decimal? WeightKg);
}
