using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record CompleteSuiteCheckoutCommand(string Reference) : ICommand<SuiteSubscriptionDto>;

internal sealed class CompleteSuiteCheckoutCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberAllocator suiteNumbers,
    IPaymentGateway paymentGateway,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<CompleteSuiteCheckoutCommand, SuiteSubscriptionDto>
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

        if (!paymentGateway.IsConfigured)
        {
            return Error.Validation(
                "payment_gateway.misconfigured",
                "Paystack is not configured.");
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

        if (string.Equals(payment.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            return await LoadSubscriptionDtoAsync(payment.UserId, cancellationToken);
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

        if (!string.Equals(verified.Status, "success", StringComparison.OrdinalIgnoreCase))
        {
            return Error.Validation(
                "checkout.payment_declined",
                "Payment was not successful. Try again or use another card.");
        }

        if (verified.AmountMinorUnits > 0
            && verified.AmountMinorUnits != payment.AmountMinorUnits)
        {
            return Error.Validation(
                "checkout.amount_mismatch",
                "Paid amount does not match the selected plan.");
        }

        var user = await users.GetByIdAsync(payment.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(payment.UserId);
        }

        var plan = await plans.GetByIdAsync(payment.PlanId, cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("suite_plan.not_found", "Suite plan not found.");
        }

        var existingSubscription = await subscriptions.GetForUserAsync(payment.UserId, cancellationToken);
        if (SuiteCheckoutBilling.IsWithinPaidPeriod(existingSubscription, clock.UtcNow))
        {
            await checkoutPayments.MarkCompletedAsync(reference, clock.UtcNow, cancellationToken);
            return await LoadSubscriptionDtoAsync(payment.UserId, cancellationToken);
        }

        var activated = await SuiteSubscriptionActivator.ActivateOrRenewAsync(
            user,
            plan,
            subscriptions,
            addresses,
            locations,
            platformConfig,
            suiteNumbers,
            unitOfWork,
            clock,
            cancellationToken);
        if (activated.IsFailure)
        {
            return activated;
        }

        await checkoutPayments.MarkCompletedAsync(reference, clock.UtcNow, cancellationToken);

        return activated;
    }

    private async Task<Result<SuiteSubscriptionDto>> LoadSubscriptionDtoAsync(
        UserId userId,
        CancellationToken cancellationToken)
    {
        var sub = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (sub is null)
        {
            return Error.NotFound("suite_subscription.not_found", "Suite subscription not found.");
        }

        return new SuiteSubscriptionDto(
            sub.Id.Value,
            sub.Status.ToString(),
            sub.SuiteNumber,
            sub.ExpiresAt,
            sub.ShipOutLocked);
    }
}
