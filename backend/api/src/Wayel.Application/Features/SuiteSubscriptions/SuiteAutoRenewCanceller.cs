using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

internal static class SuiteAutoRenewCanceller
{
    public static async Task<Result<SuiteSubscriptionDto>> CancelForUserAsync(
        UserId userId,
        ISuiteSubscriptionRepository subscriptions,
        IPaystackSubscriptionBilling paystackBilling,
        IUnitOfWork unitOfWork,
        CancellationToken cancellationToken)
    {
        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (subscription is null)
        {
            return Error.NotFound("suite_subscription.not_found", "Suite subscription not found.");
        }

        if (!subscription.AutoRenewEnabled
            || string.IsNullOrWhiteSpace(subscription.PaystackSubscriptionCode))
        {
            return Error.Validation(
                "suite_subscription.auto_renew_inactive",
                "Auto-renew is not active on this account.");
        }

        try
        {
            await paystackBilling.DisableSubscriptionAsync(
                subscription.PaystackSubscriptionCode,
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("paystack.disable_subscription_failed", ex.Message);
        }

        subscription.DisableAutoRenew();
        await subscriptions.UpdateAsync(subscription, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return SuiteSubscriptionDto.FromDomain(subscription);
    }
}
