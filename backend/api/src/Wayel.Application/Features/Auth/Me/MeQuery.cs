using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Auth.Me;

public sealed record MeQuery : IQuery<MeResponse>;

public sealed record MeResponse(
    Guid UserId,
    string Email,
    string DisplayName,
    string Role,
    string? Phone,
    string DestinationCountry,
    string KycStatus,
    SuiteAccessSummary? SuiteAccess);

public sealed record SuiteAccessSummary(
    string Status,
    bool CanReceiveParcels,
    bool CanUploadInvoices,
    bool CanShipOut,
    bool ShipOutLocked,
    string CustomerMessage,
    string? SuiteNumber,
    DateTime? ExpiresAt,
    bool AutoRenewEnabled);

internal sealed class MeQueryHandler(
    ICurrentUser currentUser,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IClock clock)
    : IQueryHandler<MeQuery, MeResponse>
{
    public async Task<Result<MeResponse>> Handle(MeQuery request, CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || currentUser.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(currentUser.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(currentUser.UserId.Value);
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);

        SuiteAccessSummary? suite = subscription is null
            ? null
            : new(
                subscription.Status.ToString(),
                caps.CanReceiveParcels,
                caps.CanUploadInvoices,
                caps.CanShipOut,
                caps.ShipOutLocked,
                caps.CustomerMessage,
                subscription.SuiteNumber,
                subscription.ExpiresAt,
                subscription.AutoRenewEnabled);

        return new MeResponse(
            user.Id.Value,
            user.Email.Value,
            user.DisplayName,
            user.Role.ToString(),
            user.Phone,
            user.DestinationCountry,
            user.KycStatus.ToString(),
            suite);
    }
}
