using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Addresses;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record ActivateSuiteSubscriptionCommand(Guid PlanId) : ICommand<SuiteSubscriptionDto>;

public sealed record SuiteSubscriptionDto(
    Guid Id,
    string Status,
    string SuiteNumber,
    DateTime? ExpiresAt,
    bool ShipOutLocked);

internal sealed class ActivateSuiteSubscriptionCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
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

        var existing = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var suiteNumber = existing?.SuiteNumber ?? $"WY-{user.Id.Value.ToString()[..8].ToUpperInvariant()}";

        SuiteSubscription subscription;
        if (existing is null)
        {
            subscription = SuiteSubscription.CreatePending(user.Id, plan.Id, suiteNumber);
            subscription.Activate(clock.UtcNow, clock.UtcNow.AddMonths(plan.DurationMonths));
            await subscriptions.AddAsync(subscription, cancellationToken);

            if (await addresses.GetSuiteForUserAsync(user.Id, cancellationToken) is null)
            {
                var suiteAddress = CustomerAddress.CreateSuite(
                    user.Id,
                    suiteNumber,
                    $"WeYell Suite {suiteNumber}, Unit 12, Jet Park Warehouse");
                await addresses.AddAsync(suiteAddress, cancellationToken);
            }
        }
        else
        {
            subscription = existing;
            subscription.Renew(clock.UtcNow.AddMonths(plan.DurationMonths));
            await subscriptions.UpdateAsync(subscription, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new SuiteSubscriptionDto(
            subscription.Id.Value,
            subscription.Status.ToString(),
            subscription.SuiteNumber,
            subscription.ExpiresAt,
            subscription.ShipOutLocked);
    }
}
