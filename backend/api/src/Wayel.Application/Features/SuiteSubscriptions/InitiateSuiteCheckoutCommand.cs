using System.Globalization;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record InitiateSuiteCheckoutCommand(
    Guid PlanId,
    string CallbackUrl,
    string? Provider = null,
    string? PayerMsisdn = null) : ICommand<InitiateSuiteCheckoutResult>;

public sealed record InitiateSuiteCheckoutResult(
    string Reference,
    string AuthorizationUrl,
    string AccessCode,
    decimal AmountZar,
    string Provider,
    string? PublicKey);

internal sealed class InitiateSuiteCheckoutCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ISuiteNumberAllocator suiteNumbers,
    IPaymentGatewayResolver paymentGatewayResolver,
    IPaystackSubscriptionBilling paystackBilling,
    IClock clock) : ICommandHandler<InitiateSuiteCheckoutCommand, InitiateSuiteCheckoutResult>
{
    public async Task<Result<InitiateSuiteCheckoutResult>> Handle(
        InitiateSuiteCheckoutCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var providerKey = string.IsNullOrWhiteSpace(request.Provider)
            ? paymentGatewayResolver.DefaultFor(request.PayerMsisdn)
            : request.Provider!.Trim().ToLowerInvariant();

        IPaymentGateway paymentGateway;
        try
        {
            paymentGateway = paymentGatewayResolver.Resolve(providerKey);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.misconfigured", ex.Message);
        }

        var callbackUrl = (request.CallbackUrl ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(callbackUrl) || !Uri.TryCreate(callbackUrl, UriKind.Absolute, out _))
        {
            return Error.Validation("checkout.invalid_callback", "A valid callback URL is required.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (!CustomerProfileRules.IsComplete(user))
        {
            return Error.Validation(
                "account.profile_incomplete",
                "Complete your profile before paying for suite access.");
        }

        var plan = await plans.GetByIdAsync(new SuitePlanId(request.PlanId), cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("suite_plan.not_found", "Suite plan not found.");
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        if (SuiteCheckoutBilling.IsWithinPaidPeriod(subscription, clock.UtcNow))
        {
            var until = subscription!.ExpiresAt!.Value.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
            return Error.Validation(
                "suite_access.already_active",
                $"Suite access is active until {until}. You can renew after that date.");
        }

        string suiteNumber;
        try
        {
            suiteNumber = await suiteNumbers.ResolveAsync(user, subscription, allocateNew: false, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("suite_platform.capacity_exhausted", ex.Message);
        }

        // Renewal counter is purely cosmetic — it lets ops eyeball whether a
        // reference belongs to a first/second/third paid period. The uniqueness
        // that prevents Paystack's "Duplicate Transaction Reference" failure
        // is the random salt baked in by BuildPaystackReference itself.
        var completedPayments = await checkoutPayments.CountCompletedForUserAsync(user.Id, cancellationToken);
        var reference = providerKey == PaymentProviders.Momo
            ? SuiteCheckoutBilling.BuildMomoReference()
            : SuiteCheckoutBilling.BuildPaystackReference(suiteNumber, completedPayments);

        var amountMinor = SuiteCheckoutBilling.ToMinorUnits(plan.PriceZar);
        var msisdn = string.IsNullOrWhiteSpace(request.PayerMsisdn) ? user.Phone : request.PayerMsisdn!.Trim();

        string? paystackPlanCode = null;
        if (providerKey == PaymentProviders.Paystack
            && paystackBilling.SubscriptionsEnabled
            && !string.IsNullOrWhiteSpace(plan.PaystackPlanCode))
        {
            paystackPlanCode = plan.PaystackPlanCode;
        }

        PaymentInitializeResult init;
        try
        {
            init = await paymentGateway.InitializeChargeAsync(
                new PaymentInitializeRequest(
                    user.Email.Value,
                    reference,
                    amountMinor,
                    callbackUrl,
                    new Dictionary<string, string>
                    {
                        ["user_id"] = user.Id.Value.ToString(),
                        ["plan_id"] = plan.Id.Value.ToString(),
                        ["payment_type"] = "suite_access",
                        ["suite_number"] = suiteNumber,
                    },
                    PayerMsisdn: msisdn,
                    PayerMessage: $"Wayel Suite {suiteNumber}",
                    PayeeNote: $"Suite access — {plan.Name}",
                    PaystackPlanCode: paystackPlanCode),
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("payment_gateway.initialize_failed", ex.Message);
        }

        await checkoutPayments.AddAsync(
            new SuiteCheckoutPaymentRecord(
                init.Reference,
                user.Id,
                plan.Id,
                amountMinor,
                "Pending",
                DateTime.UtcNow,
                null,
                paymentGateway.ProviderName,
                msisdn),
            cancellationToken);

        return new InitiateSuiteCheckoutResult(
            init.Reference,
            init.AuthorizationUrl,
            init.AccessCode,
            plan.PriceZar,
            paymentGateway.ProviderName,
            paymentGateway.PublicKey);
    }
}
