using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Payments;

namespace Wayel.Infrastructure.Billing.Momo;

/// <summary>
/// Adapts the MoMo Collections client to Wayel's <see cref="IPaymentGateway"/> contract.
/// MoMo is asynchronous: <see cref="InitializeChargeAsync"/> dispatches a RequestToPay push
/// to the customer's handset, then <see cref="VerifyChargeAsync"/> polls the status endpoint.
/// </summary>
internal sealed class MtnMomoPaymentGateway(
    IOptions<MtnMomoOptions> options,
    MtnMomoRuntimeCredentials credentials,
    MtnMomoCollectionsClient collections,
    ILogger<MtnMomoPaymentGateway> logger) : IPaymentGateway
{
    private readonly MtnMomoOptions _opts = options.Value;

    public string ProviderName => PaymentProviders.Momo;
    public string DisplayName => "MTN MoMo";

    public bool IsConfigured =>
        _opts.Enabled
        && !string.IsNullOrWhiteSpace(_opts.SubscriptionKey)
        && (credentials.HasCredentials || _opts.AllowSimulatedPayments);

    public string? PublicKey => null;

    public async Task<PaymentInitializeResult> InitializeChargeAsync(
        PaymentInitializeRequest request,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        if (string.IsNullOrWhiteSpace(request.PayerMsisdn))
        {
            throw new InvalidOperationException("MoMo requires a payer MSISDN. Set PaymentInitializeRequest.PayerMsisdn.");
        }

        if (request.AmountMinorUnits > _opts.PerTransactionMinorUnitsLimit)
        {
            throw new MtnMomoTransactionException(
                MtnMomoErrorCode.PayerLimitReached,
                $"Amount exceeds MoMo per-transaction limit ({_opts.PerTransactionMinorUnitsLimit / 100m:N2} {_opts.Currency}).");
        }

        if (!credentials.HasCredentials && _opts.AllowSimulatedPayments)
        {
            logger.LogInformation(
                "Simulating MoMo RequestToPay for reference {Reference} payer {Msisdn}",
                request.Reference,
                request.PayerMsisdn);
            return new PaymentInitializeResult(request.Reference, AuthorizationUrl: string.Empty, AccessCode: "pending");
        }

        var msisdn = MtnMomoHttpHelpers.NormaliseMsisdn(request.PayerMsisdn!);
        var body = new MomoRequestToPay(
            Amount: FormatAmount(request.AmountMinorUnits),
            Currency: _opts.Currency,
            ExternalId: request.Reference,
            Payer: MomoParty.Msisdn(msisdn),
            PayerMessage: Truncate(request.PayerMessage, 160),
            PayeeNote: Truncate(request.PayeeNote, 160));

        await collections.RequestToPayAsync(request.Reference, body, cancellationToken).ConfigureAwait(false);

        logger.LogInformation(
            "Dispatched MoMo RequestToPay {Reference} to {Msisdn} for {Amount} {Currency}",
            request.Reference,
            msisdn,
            body.Amount,
            body.Currency);

        return new PaymentInitializeResult(request.Reference, AuthorizationUrl: string.Empty, AccessCode: "pending");
    }

    public async Task<PaymentVerifyResult> VerifyChargeAsync(
        string reference,
        CancellationToken cancellationToken = default)
    {
        EnsureConfigured();

        if (!credentials.HasCredentials && _opts.AllowSimulatedPayments)
        {
            return new PaymentVerifyResult(reference, "success", 0, _opts.Currency);
        }

        var status = await collections.GetRequestToPayStatusAsync(reference, cancellationToken).ConfigureAwait(false);
        var normalisedStatus = NormaliseStatus(status.Status);

        var amountMinor = TryParseAmountMinor(status.Amount);
        var currency = string.IsNullOrWhiteSpace(status.Currency) ? _opts.Currency : status.Currency!;

        return new PaymentVerifyResult(reference, normalisedStatus, amountMinor, currency);
    }

    public Task RefundChargeAsync(string reference, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("MoMo does not support refunds through this gateway.");

    private void EnsureConfigured()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "MTN MoMo is not configured. Set Billing:MtnMomo:Enabled=true plus SubscriptionKey + ApiUser + ApiKey (or enable AllowSimulatedPayments).");
        }
    }

    private static string FormatAmount(int amountMinorUnits) =>
        (amountMinorUnits / 100m).ToString("F2", System.Globalization.CultureInfo.InvariantCulture);

    private static int TryParseAmountMinor(string? amount)
    {
        if (string.IsNullOrWhiteSpace(amount))
        {
            return 0;
        }
        return decimal.TryParse(
            amount,
            System.Globalization.NumberStyles.Number,
            System.Globalization.CultureInfo.InvariantCulture,
            out var parsed)
            ? (int)Math.Round(parsed * 100m)
            : 0;
    }

    private static string NormaliseStatus(string? raw) => (raw ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "SUCCESSFUL" => "success",
        "FAILED" => "failed",
        "PENDING" => "pending",
        _ => "pending",
    };

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Length <= max ? value : value[..max];
    }
}
