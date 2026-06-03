using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.PaymentMethods;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

internal sealed class SuiteCheckoutCompletionService(
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ICustomerSavedCardRepository savedCards,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberAllocator suiteNumbers,
    IPayLaterIntentRepository payLaterIntents,
    IPaystackSubscriptionBilling paystackBilling,
    IUnitOfWork unitOfWork,
    IClock clock)
{
    public async Task<Result<SuiteSubscriptionDto>> CompleteCheckoutPaymentAsync(
        SuiteCheckoutPaymentRecord payment,
        PaymentVerifyResult verified,
        User user,
        IPaymentGateway paymentGateway,
        CancellationToken cancellationToken)
    {
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

        var plan = await plans.GetByIdAsync(payment.PlanId, cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("suite_plan.not_found", "Suite plan not found.");
        }

        var existingSubscription = await subscriptions.GetForUserAsync(payment.UserId, cancellationToken);
        if (SuiteCheckoutBilling.IsWithinPaidPeriod(existingSubscription, clock.UtcNow))
        {
            await checkoutPayments.MarkCompletedAsync(payment.Reference, clock.UtcNow, cancellationToken);
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

        await checkoutPayments.MarkCompletedAsync(payment.Reference, clock.UtcNow, cancellationToken);

        if (verified.CardAuthorization is not null
            && string.Equals(paymentGateway.ProviderName, PaymentProviders.Paystack, StringComparison.OrdinalIgnoreCase))
        {
            await SavedCardUpsert.TrySaveFromAuthorizationAsync(
                payment.UserId,
                verified.CardAuthorization,
                label: null,
                savedCards,
                cancellationToken);
        }

        await TryLinkPaystackSubscriptionAsync(user, plan, verified, cancellationToken);
        await payLaterIntents.MarkResolvedAsync(payment.UserId, clock.UtcNow, cancellationToken);

        return await LoadSubscriptionDtoAsync(payment.UserId, cancellationToken);
    }

    public async Task<Result> ProcessPaystackChargeSuccessAsync(
        PaystackWebhookEvent webhookEvent,
        CancellationToken cancellationToken)
    {
        var reference = (webhookEvent.Reference ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(reference))
        {
            return Result.Success();
        }

        var payment = await checkoutPayments.GetByReferenceAsync(reference, cancellationToken);
        if (payment is not null
            && string.Equals(payment.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            return Result.Success();
        }

        if (payment is not null)
        {
            var user = await users.GetByIdAsync(payment.UserId, cancellationToken);
            if (user is null)
            {
                return Result.Success();
            }

            var verified = new PaymentVerifyResult(
                reference,
                "success",
                webhookEvent.AmountMinorUnits > 0
                    ? webhookEvent.AmountMinorUnits
                    : payment.AmountMinorUnits,
                webhookEvent.Currency ?? "ZAR",
                CardAuthorization: null,
                webhookEvent.SubscriptionCode,
                null);

            var result = await CompleteCheckoutPaymentAsync(
                payment,
                verified,
                user,
                new WebhookPaystackGateway(),
                cancellationToken);
            return result.IsFailure ? result.Error : Result.Success();
        }

        return await ProcessSubscriptionRenewalAsync(webhookEvent, reference, cancellationToken);
    }

    public async Task<Result> ProcessPaystackSubscriptionDisabledAsync(
        PaystackWebhookEvent webhookEvent,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(webhookEvent.SubscriptionCode))
        {
            return Result.Success();
        }

        var subscription = await subscriptions.GetByPaystackSubscriptionCodeAsync(
            webhookEvent.SubscriptionCode,
            cancellationToken);
        if (subscription is null || !subscription.AutoRenewEnabled)
        {
            return Result.Success();
        }

        subscription.DisableAutoRenew();
        await subscriptions.UpdateAsync(subscription, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private async Task<Result> ProcessSubscriptionRenewalAsync(
        PaystackWebhookEvent webhookEvent,
        string reference,
        CancellationToken cancellationToken)
    {
        Wayel.Domain.SuiteSubscriptions.SuiteSubscription? subscription = null;
        if (!string.IsNullOrWhiteSpace(webhookEvent.SubscriptionCode))
        {
            subscription = await subscriptions.GetByPaystackSubscriptionCodeAsync(
                webhookEvent.SubscriptionCode,
                cancellationToken);
        }

        UserId userId;
        SuitePlanId planId;
        if (subscription is not null)
        {
            userId = subscription.UserId;
            planId = subscription.PlanId;
        }
        else if (!TryResolveMetadata(webhookEvent.Metadata, out userId, out planId))
        {
            return Result.Success();
        }
        else
        {
            subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
            if (subscription is null)
            {
                return Result.Success();
            }
        }

        var plan = await plans.GetByIdAsync(planId, cancellationToken);
        if (plan is null)
        {
            return Result.Success();
        }

        var amountMinor = webhookEvent.AmountMinorUnits > 0
            ? webhookEvent.AmountMinorUnits
            : SuiteCheckoutBilling.ToMinorUnits(plan.PriceZar);

        await checkoutPayments.AddAsync(
            new SuiteCheckoutPaymentRecord(
                reference,
                userId,
                planId,
                amountMinor,
                "Completed",
                clock.UtcNow,
                clock.UtcNow,
                PaymentProviders.Paystack),
            cancellationToken);

        var anchor = subscription!.ExpiresAt > clock.UtcNow
            ? subscription.ExpiresAt!.Value
            : clock.UtcNow;
        subscription.Renew(anchor.AddMonths(plan.DurationMonths));

        if (!string.IsNullOrWhiteSpace(webhookEvent.SubscriptionCode)
            && string.IsNullOrWhiteSpace(subscription.PaystackSubscriptionCode))
        {
            subscription.LinkPaystackSubscription(webhookEvent.SubscriptionCode, null);
        }

        await subscriptions.UpdateAsync(subscription, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private async Task TryLinkPaystackSubscriptionAsync(
        User user,
        SuitePlan plan,
        PaymentVerifyResult verified,
        CancellationToken cancellationToken)
    {
        if (!paystackBilling.SubscriptionsEnabled
            || string.IsNullOrWhiteSpace(plan.PaystackPlanCode))
        {
            return;
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        if (subscription is null)
        {
            return;
        }

        PaystackSubscriptionLink? link = null;
        if (!string.IsNullOrWhiteSpace(verified.PaystackSubscriptionCode))
        {
            link = new PaystackSubscriptionLink(
                verified.PaystackSubscriptionCode,
                verified.PaystackCustomerCode,
                "active");
        }
        else
        {
            link = await paystackBilling.ResolveSubscriptionForCustomerAsync(
                user.Email.Value,
                plan.PaystackPlanCode,
                cancellationToken);
        }

        if (link is null)
        {
            return;
        }

        subscription.LinkPaystackSubscription(link.SubscriptionCode, link.CustomerCode);
        await subscriptions.UpdateAsync(subscription, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static bool TryResolveMetadata(
        IReadOnlyDictionary<string, string> metadata,
        out UserId userId,
        out SuitePlanId planId)
    {
        userId = default!;
        planId = default!;
        if (!metadata.TryGetValue("user_id", out var userRaw)
            || !Guid.TryParse(userRaw, out var userGuid)
            || !metadata.TryGetValue("plan_id", out var planRaw)
            || !Guid.TryParse(planRaw, out var planGuid))
        {
            return false;
        }

        userId = new UserId(userGuid);
        planId = new SuitePlanId(planGuid);
        return true;
    }

    public async Task<Result<SuiteSubscriptionDto>> LoadSubscriptionDtoAsync(
        UserId userId,
        CancellationToken cancellationToken)
    {
        var sub = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (sub is null)
        {
            return Error.NotFound("suite_subscription.not_found", "Suite subscription not found.");
        }

        return SuiteSubscriptionDto.FromDomain(sub);
    }

    /// <summary>Minimal gateway stub so webhook completion can reuse checkout logic without card tokenisation.</summary>
    private sealed class WebhookPaystackGateway : IPaymentGateway
    {
        public string ProviderName => PaymentProviders.Paystack;
        public string DisplayName => "Paystack";
        public bool IsConfigured => true;
        public string? PublicKey => null;

        public Task<PaymentInitializeResult> InitializeChargeAsync(
            PaymentInitializeRequest request,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<PaymentVerifyResult> VerifyChargeAsync(
            string reference,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task RefundChargeAsync(string reference, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
