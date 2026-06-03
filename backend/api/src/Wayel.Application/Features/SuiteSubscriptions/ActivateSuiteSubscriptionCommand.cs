using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record ActivateSuiteSubscriptionCommand(Guid PlanId) : ICommand<SuiteSubscriptionDto>;

public sealed record SuiteSubscriptionDto(
    Guid Id,
    string Status,
    string SuiteNumber,
    DateTime? ExpiresAt,
    bool ShipOutLocked,
    bool IsTrial = false,
    bool AutoRenewEnabled = false)
{
    public static SuiteSubscriptionDto FromDomain(Wayel.Domain.SuiteSubscriptions.SuiteSubscription sub) =>
        new(
            sub.Id.Value,
            sub.Status.ToString(),
            sub.SuiteNumber,
            sub.ExpiresAt,
            sub.ShipOutLocked,
            sub.IsTrial,
            sub.AutoRenewEnabled);
}

internal sealed class ActivateSuiteSubscriptionCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberAllocator suiteNumbers,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<ActivateSuiteSubscriptionCommand, SuiteSubscriptionDto>
{
    public async Task<Result<SuiteSubscriptionDto>> Handle(
        ActivateSuiteSubscriptionCommand request,
        CancellationToken cancellationToken)
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

        if (!CustomerProfileRules.IsComplete(user))
        {
            return Error.Validation(
                "account.profile_incomplete",
                "Complete your profile before activating suite access.");
        }

        var plan = await plans.GetByIdAsync(new SuitePlanId(request.PlanId), cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("suite_plan.not_found", "Suite plan not found.");
        }

        return await SuiteSubscriptionActivator.ActivateOrRenewAsync(
            user,
            plan,
            subscriptions,
            addresses,
            locations,
            platformConfig,
            suiteNumbers,
            unitOfWork,
            clock,
            cancellationToken);
    }
}
