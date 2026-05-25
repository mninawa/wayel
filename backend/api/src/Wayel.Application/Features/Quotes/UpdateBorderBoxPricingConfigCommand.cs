using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Quotes;

public sealed record UpdateBorderBoxPricingConfigCommand(
    bool ChargeVat,
    bool ChargeWeightSurcharge,
    decimal PudoFlatFeeZar,
    decimal DoorToDoorFlatFeeZar,
    decimal PerKgSurchargeZar,
    decimal DutyRate,
    decimal VatRate,
    decimal DutyGoodsValueThresholdZar,
    decimal PaymentHandlingFeeRate,
    decimal HandlingFeeShareZar,
    decimal PickupFeeShareZar) : ICommand<BorderBoxPricingConfigDto>;

internal sealed class UpdateBorderBoxPricingConfigCommandHandler(
    IBorderBoxPricingConfigRepository repository,
    IClock clock) : ICommandHandler<UpdateBorderBoxPricingConfigCommand, BorderBoxPricingConfigDto>
{
    public async Task<Result<BorderBoxPricingConfigDto>> Handle(
        UpdateBorderBoxPricingConfigCommand request,
        CancellationToken cancellationToken)
    {
        if (request.PudoFlatFeeZar < 0
            || request.DoorToDoorFlatFeeZar < 0
            || request.PerKgSurchargeZar < 0)
        {
            return Error.Validation("pricing.invalid_fee", "Fees cannot be negative.");
        }

        if (request.DutyRate is < 0 or > 1
            || request.VatRate is < 0 or > 1
            || request.PaymentHandlingFeeRate is < 0 or > 1)
        {
            return Error.Validation(
                "pricing.invalid_rate",
                "Duty, VAT, and payment handling rates must be between 0 and 1.");
        }

        if (request.DutyGoodsValueThresholdZar < 0
            || request.HandlingFeeShareZar < 0
            || request.PickupFeeShareZar < 0)
        {
            return Error.Validation(
                "pricing.invalid_threshold",
                "Threshold and service fee shares cannot be negative.");
        }

        if (request.HandlingFeeShareZar + request.PickupFeeShareZar <= 0)
        {
            return Error.Validation(
                "pricing.invalid_service_shares",
                "Handling and freight shares must sum to more than zero.");
        }

        var settings = new BorderBoxPricingSettings(
            request.ChargeVat,
            request.ChargeWeightSurcharge,
            request.PudoFlatFeeZar,
            request.DoorToDoorFlatFeeZar,
            request.PerKgSurchargeZar,
            request.DutyRate,
            request.VatRate,
            request.DutyGoodsValueThresholdZar,
            request.PaymentHandlingFeeRate,
            request.HandlingFeeShareZar,
            request.PickupFeeShareZar,
            clock.UtcNow);

        await repository.SaveAsync(settings, cancellationToken);
        return settings.ToDto();
    }
}
