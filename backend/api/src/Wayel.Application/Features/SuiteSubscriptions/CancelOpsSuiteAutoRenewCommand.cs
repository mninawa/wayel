using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record CancelOpsSuiteAutoRenewCommand(Guid UserId) : ICommand<SuiteSubscriptionDto>;

internal sealed class CancelOpsSuiteAutoRenewCommandHandler(
    ISuiteSubscriptionRepository subscriptions,
    IPaystackSubscriptionBilling paystackBilling,
    IUnitOfWork unitOfWork) : ICommandHandler<CancelOpsSuiteAutoRenewCommand, SuiteSubscriptionDto>
{
    public Task<Result<SuiteSubscriptionDto>> Handle(
        CancelOpsSuiteAutoRenewCommand request,
        CancellationToken cancellationToken) =>
        SuiteAutoRenewCanceller.CancelForUserAsync(
            new UserId(request.UserId),
            subscriptions,
            paystackBilling,
            unitOfWork,
            cancellationToken);
}
