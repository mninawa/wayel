using System.Text.Json.Serialization;
using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.SuitePlatform;

namespace Wayel.Api.Endpoints;

public sealed class SuitePlatformOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/platform/suites")
            .WithTags("WeYell Suite Platform Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/regions", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListSuitePlatformRegionsQuery(), ct)).ToHttpResult())
            .WithName("ListSuitePlatformRegionsOps")
            .WithSummary("List suite platform regions with capacity summary");

        group.MapGet("/regions/{regionCode}", async (string regionCode, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetSuitePlatformConfigQuery(regionCode), ct)).ToHttpResult())
            .WithName("GetSuitePlatformConfigOps")
            .WithSummary("Get suite platform configuration for a destination region");

        group.MapPut("/regions/{regionCode}", async (
            string regionCode,
            UpdateSuitePlatformConfigRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new UpdateSuitePlatformConfigCommand(
                    regionCode,
                    body.IsActive,
                    body.WarehouseName,
                    body.AddressLine1,
                    body.AddressLine2,
                    body.City,
                    body.Province,
                    body.PostalCode,
                    body.CountryCode,
                    body.TotalSuiteCapacity,
                    body.NumberPrefix,
                    body.GenerationMode,
                    body.UserIdSuffixLength,
                    body.SequencePadLength,
                    body.NextSequenceNumber),
                ct)).ToHttpResult())
            .WithName("UpdateSuitePlatformConfigOps")
            .WithSummary("Update suite platform configuration for a destination region");

        // Legacy single-config routes (Eswatini / default region).
        group.MapGet("/config", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetSuitePlatformConfigQuery("SZ"), ct)).ToHttpResult())
            .WithName("GetSuitePlatformConfigOpsLegacy");

        group.MapPut("/config", async (UpdateSuitePlatformConfigRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpdateSuitePlatformConfigCommand(
                    "SZ",
                    body.IsActive,
                    body.WarehouseName,
                    body.AddressLine1,
                    body.AddressLine2,
                    body.City,
                    body.Province,
                    body.PostalCode,
                    body.CountryCode,
                    body.TotalSuiteCapacity,
                    body.NumberPrefix,
                    body.GenerationMode,
                    body.UserIdSuffixLength,
                    body.SequencePadLength,
                    body.NextSequenceNumber),
                ct)).ToHttpResult())
            .WithName("UpdateSuitePlatformConfigOpsLegacy");
    }

    private sealed record UpdateSuitePlatformConfigRequest(
        [property: JsonPropertyName("isActive")] bool IsActive,
        [property: JsonPropertyName("warehouseName")] string WarehouseName,
        [property: JsonPropertyName("addressLine1")] string AddressLine1,
        [property: JsonPropertyName("addressLine2")] string? AddressLine2,
        [property: JsonPropertyName("city")] string City,
        [property: JsonPropertyName("province")] string Province,
        [property: JsonPropertyName("postalCode")] string PostalCode,
        [property: JsonPropertyName("countryCode")] string CountryCode,
        [property: JsonPropertyName("totalSuiteCapacity")] int TotalSuiteCapacity,
        [property: JsonPropertyName("numberPrefix")] string NumberPrefix,
        [property: JsonPropertyName("generationMode")] string GenerationMode,
        [property: JsonPropertyName("userIdSuffixLength")] int UserIdSuffixLength,
        [property: JsonPropertyName("sequencePadLength")] int SequencePadLength,
        [property: JsonPropertyName("nextSequenceNumber")] long NextSequenceNumber);
}
