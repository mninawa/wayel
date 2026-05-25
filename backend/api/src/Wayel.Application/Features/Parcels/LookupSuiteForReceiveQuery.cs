using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record SuiteReceiveLookupDto(
    string SuiteNumber,
    string CustomerUserId,
    string CustomerEmail,
    string CustomerDisplayName,
    string SuiteAccessStatus,
    bool CanReceiveParcels,
    string CustomerMessage);

public sealed record LookupSuiteForReceiveQuery(string SuiteNumber) : IQuery<SuiteReceiveLookupDto>;

internal sealed class LookupSuiteForReceiveQueryHandler(
    ISuiteSubscriptionRepository subscriptions,
    IUserRepository users,
    IClock clock) : IQueryHandler<LookupSuiteForReceiveQuery, SuiteReceiveLookupDto>
{
    public async Task<Result<SuiteReceiveLookupDto>> Handle(
        LookupSuiteForReceiveQuery request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.SuiteNumber))
        {
            return Error.Validation("parcel.suite_required", "Suite number is required.");
        }

        var subscription = await subscriptions.GetBySuiteNumberAsync(request.SuiteNumber, cancellationToken);
        if (subscription is null || string.IsNullOrWhiteSpace(subscription.SuiteNumber))
        {
            return Error.NotFound("parcel.suite_not_found", "No customer is assigned to this suite number.");
        }

        var user = await users.GetByIdAsync(subscription.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(subscription.UserId);
        }

        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        subscription.RefreshStatus(clock.UtcNow);

        return new SuiteReceiveLookupDto(
            subscription.SuiteNumber,
            user.Id.Value.ToString(),
            user.Email.Value,
            user.DisplayName,
            subscription.Status.ToString(),
            caps.CanReceiveParcels,
            caps.CustomerMessage);
    }
}
