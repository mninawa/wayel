using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

/// <summary>
/// Ops-side variant of <see cref="GetSuitePaymentsOverviewQuery"/> — same
/// response shape, but the caller specifies the target user. The
/// endpoint is gated by ops-role authorisation at the API surface.
/// </summary>
public sealed record GetOpsSuitePaymentsOverviewQuery(Guid UserId) : IQuery<SuitePaymentsOverviewDto>;

internal sealed class GetOpsSuitePaymentsOverviewQueryHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ICustomerSavedCardRepository savedCards,
    ISuitePlanRepository plans,
    IClock clock) : IQueryHandler<GetOpsSuitePaymentsOverviewQuery, SuitePaymentsOverviewDto>
{
    public async Task<Result<SuitePaymentsOverviewDto>> Handle(
        GetOpsSuitePaymentsOverviewQuery request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(userId);
        }

        return await SuitePaymentsOverviewProjector.BuildAsync(
            user,
            subscriptions,
            checkoutPayments,
            savedCards,
            plans,
            clock,
            cancellationToken);
    }
}
