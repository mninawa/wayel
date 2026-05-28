namespace Wayel.Application.Abstractions.Payments;

public interface ICardVerificationBillingOptions
{
    int VerifyChargeMinorUnits { get; }

    bool RefundVerifyCharge { get; }
}
