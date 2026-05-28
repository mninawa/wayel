using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing;

internal sealed class CardVerificationBillingOptions(IOptions<PaystackOptions> options) : ICardVerificationBillingOptions
{
    public int VerifyChargeMinorUnits => Math.Max(100, options.Value.VerifyChargeMinorUnits);

    public bool RefundVerifyCharge => options.Value.RefundVerifyCharge;
}
