using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.Auth.Me;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Dashboard;

public sealed record GetDashboardQuery : IQuery<DashboardResponse>;

public sealed record DashboardResponse(SuiteAccessSummary SuiteAccess, int ParcelCount, string? SuiteNumber);

internal sealed class GetDashboardQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IParcelRepository parcels,
    IClock clock) : IQueryHandler<GetDashboardQuery, DashboardResponse>
{
    public async Task<Result<DashboardResponse>> Handle(GetDashboardQuery request, CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        var parcelList = await parcels.ListForUserAsync(user.Id, cancellationToken);

        var summary = new SuiteAccessSummary(
            subscription?.Status.ToString() ?? nameof(Domain.SuiteSubscriptions.SuiteAccessStatus.PendingPayment),
            caps.CanReceiveParcels,
            caps.CanUploadInvoices,
            caps.CanShipOut,
            caps.ShipOutLocked,
            caps.CustomerMessage,
            subscription?.SuiteNumber,
            subscription?.ExpiresAt);

        return new DashboardResponse(summary, parcelList.Count, subscription?.SuiteNumber);
    }
}
