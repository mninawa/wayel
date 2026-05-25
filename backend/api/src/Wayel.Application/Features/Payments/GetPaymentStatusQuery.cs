using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Payments;

/// <summary>
/// Polls the upstream gateway for a single payment reference. Used by MoMo's "approve on your phone"
/// SPA flow to find out when the customer approves / declines the push.
/// </summary>
public sealed record GetPaymentStatusQuery(string Reference) : IQuery<PaymentStatusDto>;

public sealed record PaymentStatusDto(
    string Reference,
    string Provider,
    string Status,
    int AmountMinorUnits,
    string Currency);

internal sealed class GetPaymentStatusQueryHandler(
    ICurrentUser current,
    IQuoteCheckoutPaymentRepository quoteCheckouts,
    ISuiteCheckoutPaymentRepository suiteCheckouts,
    IPaymentGatewayResolver resolver) : IQueryHandler<GetPaymentStatusQuery, PaymentStatusDto>
{
    public async Task<Result<PaymentStatusDto>> Handle(
        GetPaymentStatusQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var reference = (request.Reference ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(reference))
        {
            return Error.Validation("payment.missing_reference", "Payment reference is required.");
        }

        var quotePayment = await quoteCheckouts.GetByReferenceAsync(reference, cancellationToken);
        string provider;
        if (quotePayment is not null)
        {
            if (quotePayment.UserId != current.UserId)
            {
                return Error.Forbidden("payment.forbidden", "This payment belongs to another account.");
            }
            provider = quotePayment.Provider;
        }
        else
        {
            var suitePayment = await suiteCheckouts.GetByReferenceAsync(reference, cancellationToken);
            if (suitePayment is null)
            {
                return Error.NotFound("payment.not_found", "Payment reference not recognised.");
            }
            if (suitePayment.UserId != current.UserId)
            {
                return Error.Forbidden("payment.forbidden", "This payment belongs to another account.");
            }
            provider = suitePayment.Provider;
        }

        IPaymentGateway gateway;
        try
        {
            gateway = resolver.Resolve(provider);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.misconfigured", ex.Message);
        }

        PaymentVerifyResult result;
        try
        {
            result = await gateway.VerifyChargeAsync(reference, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment.verify_failed", ex.Message);
        }
        catch (Exception ex)
        {
            return Error.Validation("payment.verify_failed", ex.Message);
        }

        return new PaymentStatusDto(
            reference,
            gateway.ProviderName,
            result.Status,
            result.AmountMinorUnits,
            result.Currency);
    }
}
