using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Implements <see cref="IMomoAccountValidator"/> by calling
/// <see cref="MtnMomoCollectionsClient.IsAccountHolderActiveAsync"/>.
///
/// <para>Sandbox responses are permissive — almost every well-formed MSISDN
/// resolves as active — so this primarily guards against malformed input and
/// missing wallets in production.</para>
/// </summary>
internal sealed class MtnMomoAccountValidator(
    IOptions<MtnMomoOptions> options,
    MtnMomoCollectionsClient collections,
    MtnMomoRuntimeCredentials credentials,
    ILogger<MtnMomoAccountValidator> logger) : IMomoAccountValidator
{
    private readonly MtnMomoOptions _opts = options.Value;

    public async Task<MomoAccountValidationResult> ValidateAsync(
        string msisdn,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(msisdn))
        {
            return new MomoAccountValidationResult(false, string.Empty, "Enter the phone number linked to your MTN MoMo wallet.");
        }

        string normalised;
        try
        {
            normalised = MtnMomoHttpHelpers.NormaliseMsisdn(msisdn);
        }
        catch (ArgumentException ex)
        {
            return new MomoAccountValidationResult(false, msisdn, ex.Message);
        }

        if (normalised.Length < 7 || normalised.Length > 15)
        {
            return new MomoAccountValidationResult(
                false,
                normalised,
                "Enter the full phone number including country code (for example +27 82 123 4567).");
        }

        if (!_opts.Enabled || string.IsNullOrWhiteSpace(_opts.SubscriptionKey))
        {
            return new MomoAccountValidationResult(
                false,
                normalised,
                "MTN MoMo is not available at the moment. Please pick another payment method.");
        }

        if (!credentials.HasCredentials && !_opts.AllowSimulatedPayments)
        {
            return new MomoAccountValidationResult(
                false,
                normalised,
                "MTN MoMo is still being provisioned. Please try again in a moment.");
        }

        // Simulated mode (local dev) — accept any well-formed MSISDN without hitting MTN.
        if (!credentials.HasCredentials && _opts.AllowSimulatedPayments)
        {
            return new MomoAccountValidationResult(true, normalised, null);
        }

        try
        {
            var active = await collections.IsAccountHolderActiveAsync(normalised, cancellationToken)
                .ConfigureAwait(false);
            return active
                ? new MomoAccountValidationResult(true, normalised, null)
                : new MomoAccountValidationResult(false, normalised, "No active MTN MoMo wallet is registered for this number.");
        }
        catch (MtnMomoNotFoundException)
        {
            return new MomoAccountValidationResult(false, normalised, "No MTN MoMo wallet is registered for this number.");
        }
        catch (MtnMomoTransactionException ex)
        {
            logger.LogInformation(
                "MoMo account holder probe returned business error for {Msisdn}: {Code} / {RawCode}",
                normalised,
                ex.ErrorCode,
                ex.RawCode);
            return new MomoAccountValidationResult(false, normalised, ex.Message);
        }
        catch (MtnMomoException ex)
        {
            logger.LogWarning(ex, "MoMo account holder probe failed for {Msisdn}", normalised);
            return new MomoAccountValidationResult(false, normalised, "Could not reach MTN MoMo right now. Please try again.");
        }
    }
}
