using System.Text.Json.Serialization;
using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Quotes;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Ops API to read/update BorderBox pricing config (Mongo). UI can call these later.
/// Secured with <c>X-Wayel-Ops-Key</c> (same as KYC / parcel ops).
/// </summary>
public sealed class BorderBoxPricingOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/pricing")
            .WithTags("WeYell Pricing Ops")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/config", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetBorderBoxPricingConfigQuery(), ct)).ToHttpResult())
            .WithName("GetBorderBoxPricingConfigOps")
            .WithSummary("Get BorderBox pricing configuration");

        group.MapPut("/config", async (UpdateBorderBoxPricingConfigRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpdateBorderBoxPricingConfigCommand(
                    body.ChargeVat,
                    body.ChargeWeightSurcharge,
                    body.PudoFlatFeeZar,
                    body.DoorToDoorFlatFeeZar,
                    body.PerKgSurchargeZar,
                    body.DutyRate,
                    body.VatRate,
                    body.DutyGoodsValueThresholdZar,
                    body.PaymentHandlingFeeRate,
                    body.HandlingFeeShareZar,
                    body.PickupFeeShareZar),
                ct)).ToHttpResult())
            .WithName("UpdateBorderBoxPricingConfigOps")
            .WithSummary("Update BorderBox pricing configuration");
    }

    private sealed record UpdateBorderBoxPricingConfigRequest(
        [property: JsonPropertyName("chargeVat")] bool ChargeVat,
        [property: JsonPropertyName("chargeWeightSurcharge")] bool ChargeWeightSurcharge,
        [property: JsonPropertyName("pudoFlatFeeZar")] decimal PudoFlatFeeZar,
        [property: JsonPropertyName("doorToDoorFlatFeeZar")] decimal DoorToDoorFlatFeeZar,
        [property: JsonPropertyName("perKgSurchargeZar")] decimal PerKgSurchargeZar,
        [property: JsonPropertyName("dutyRate")] decimal DutyRate,
        [property: JsonPropertyName("vatRate")] decimal VatRate,
        [property: JsonPropertyName("dutyGoodsValueThresholdZar")] decimal DutyGoodsValueThresholdZar,
        [property: JsonPropertyName("paymentHandlingFeeRate")] decimal PaymentHandlingFeeRate,
        [property: JsonPropertyName("handlingFeeShareZar")] decimal HandlingFeeShareZar,
        [property: JsonPropertyName("pickupFeeShareZar")] decimal PickupFeeShareZar);
}
