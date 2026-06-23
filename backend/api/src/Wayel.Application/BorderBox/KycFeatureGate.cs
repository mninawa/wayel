using Wayel.Application.Configuration;
using Wayel.Domain.Common;

namespace Wayel.Application.BorderBox;

internal static class KycFeatureGate
{
    public const string DisabledMessage = "Identity verification is not available right now.";

    public static Error? RequireCustomerKycEnabled(KycOptions options) =>
        options.Enabled
            ? null
            : Error.Validation("kyc.disabled", DisabledMessage);
}
