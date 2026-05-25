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

public sealed record InitiateSuiteCheckoutCommand(Guid PlanId, string CallbackUrl)
    : ICommand<InitiateSuiteCheckoutResult>;

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
    IPaymentGateway paymentGateway,
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

        if (!paymentGateway.IsConfigured)
        {
            return Error.Validation(
                "payment_gateway.misconfigured",
                "Paystack is not configured. Set Billing:Paystack:SecretKey.");
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

        var completedPayments = await checkoutPayments.CountCompletedForUserAsync(user.Id, cancellationToken);
        var reference = SuiteCheckoutBilling.BuildPaystackReference(suiteNumber, completedPayments);

        var amountMinor = ToMinorUnits(plan.PriceZar);

        var init = await paymentGateway.InitializeChargeAsync(
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
                }),
            cancellationToken);

        await checkoutPayments.AddAsync(
            new SuiteCheckoutPaymentRecord(
                init.Reference,
                user.Id,
                plan.Id,
                amountMinor,
                "Pending",
                DateTime.UtcNow,
                null),
            cancellationToken);

        return new InitiateSuiteCheckoutResult(
            init.Reference,
            init.AuthorizationUrl,
            init.AccessCode,
            plan.PriceZar,
            "Paystack",
            paymentGateway.PublicKey);
    }

    internal static int ToMinorUnits(decimal amountZar) =>
        (int)Math.Round(amountZar * 100m, MidpointRounding.AwayFromZero);
}
