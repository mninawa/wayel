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

        return await SuiteAutoRenewCanceller.CancelForUserAsync(
            current.UserId.Value,
            subscriptions,
            paystackBilling,
            unitOfWork,
            cancellationToken);
    }
}
