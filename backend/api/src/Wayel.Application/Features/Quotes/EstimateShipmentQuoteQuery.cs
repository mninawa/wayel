using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record EstimateShipmentQuoteQuery(
    IReadOnlyList<Guid> ParcelIds,
    string DeliveryMethod) : IQuery<ShipmentQuoteEstimateDto>;

public sealed record ShipmentQuoteEstimateDto(
    decimal TotalLandedCost,
    decimal DeclaredGoodsValueZar,
    bool VatCharged,
    bool DutyCharged,
    decimal DutyGoodsValueThresholdZar,
    decimal TotalWeightKg,
    int ParcelCount,
    string DeliveryEstimate,
    IReadOnlyList<QuoteBreakdownLineDto> Breakdown);

internal sealed class EstimateShipmentQuoteQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions) : IQueryHandler<EstimateShipmentQuoteQuery, ShipmentQuoteEstimateDto>
{
    public async Task<Result<ShipmentQuoteEstimateDto>> Handle(
        EstimateShipmentQuoteQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (request.ParcelIds.Count == 0)
        {
            return Error.Validation("shipment.parcels_required", "Select at least one parcel.");
        }

        var loaded = new List<Parcel>();
        foreach (var id in request.ParcelIds.Distinct())
        {
            var parcel = await parcels.GetByIdAsync(new ParcelId(id), cancellationToken);
            if (parcel is null || parcel.UserId != user.Id)
            {
                return Error.Validation("shipment.parcel_invalid", "One or more parcels are invalid.");
            }

            if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
            {
                return Error.Validation("shipment.parcel_unavailable", $"{parcel.ItemName} is not available to ship.");
            }

            loaded.Add(parcel);
        }

        var config = await BorderBoxPricingConfigLoader.LoadAsync(
            pricingConfig,
            pricingOptions,
            cancellationToken);
        var pricing = QuotePricing.Compute(
            loaded,
            QuotePricing.NormalizeDeliveryMethod(request.DeliveryMethod),
            config);
        return new ShipmentQuoteEstimateDto(
            pricing.TotalLandedCost,
            pricing.DeclaredGoodsValueZar,
            pricing.VatCharged,
            pricing.DutyCharged,
            config.DutyGoodsValueThresholdZar,
            loaded.Sum(p => p.WeightKg ?? 0m),
            loaded.Count,
            QuotePricing.DeliveryEstimate(request.DeliveryMethod),
            pricing.Breakdown);
    }
}
