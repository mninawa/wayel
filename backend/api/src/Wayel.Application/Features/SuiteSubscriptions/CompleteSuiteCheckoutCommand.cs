using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record CompleteSuiteCheckoutCommand(string Reference) : ICommand<SuiteSubscriptionDto>;

internal sealed class CompleteSuiteCheckoutCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    IPaymentGatewayResolver paymentGatewayResolver,
    SuiteCheckoutCompletionService completionService) : ICommandHandler<CompleteSuiteCheckoutCommand, SuiteSubscriptionDto>
{
    public async Task<Result<SuiteSubscriptionDto>> Handle(
        CompleteSuiteCheckoutCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var reference = (request.Reference ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(reference))
        {
            return Error.Validation("checkout.missing_reference", "Payment reference is required.");
        }

        var payment = await checkoutPayments.GetByReferenceAsync(reference, cancellationToken);
        if (payment is null)
        {
            return Error.NotFound("checkout.not_found", "Checkout session not found.");
        }

        if (payment.UserId != current.UserId)
        {
            return Error.Forbidden("checkout.forbidden", "This payment belongs to another account.");
        }

        IPaymentGateway paymentGateway;
        try
        {
            paymentGateway = paymentGatewayResolver.Resolve(payment.Provider);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.misconfigured", ex.Message);
        }

        if (string.Equals(payment.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            return await completionService.LoadSubscriptionDtoAsync(payment.UserId, cancellationToken);
        }

        PaymentVerifyResult verified;
        try
        {
            verified = await paymentGateway.VerifyChargeAsync(reference, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("checkout.verify_failed", ex.Message);
        }

        var user = await users.GetByIdAsync(payment.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(payment.UserId);
        }

        return await completionService.CompleteCheckoutPaymentAsync(
            payment,
            verified,
            user,
            paymentGateway,
            cancellationToken);
    }
}
