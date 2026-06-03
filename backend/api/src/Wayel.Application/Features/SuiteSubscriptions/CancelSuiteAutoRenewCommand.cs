using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record CancelSuiteAutoRenewCommand : ICommand<SuiteSubscriptionDto>;

internal sealed class CancelSuiteAutoRenewCommandHandler(
    ICurrentUser current,
    ISuiteSubscriptionRepository subscriptions,
    IPaystackSubscriptionBilling paystackBilling,
    IUnitOfWork unitOfWork) : ICommandHandler<CancelSuiteAutoRenewCommand, SuiteSubscriptionDto>
{
    public async Task<Result<SuiteSubscriptionDto>> Handle(
        CancelSuiteAutoRenewCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var subscription = await subscriptions.GetForUserAsync(current.UserId.Value, cancellationToken);
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
