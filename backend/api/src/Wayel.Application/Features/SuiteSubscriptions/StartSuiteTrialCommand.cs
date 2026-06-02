using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record StartSuiteTrialCommand : ICommand<SuiteSubscriptionDto>;

internal sealed class StartSuiteTrialCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuitePlanRepository plans,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ICustomerAddressRepository addresses,
    IWarehouseLocationRepository locations,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberAllocator suiteNumbers,
    IPayLaterIntentRepository payLaterIntents,
    IUnitOfWork unitOfWork,
    IOptions<BorderBoxOptions> borderBoxOptions,
    IClock clock) : ICommandHandler<StartSuiteTrialCommand, SuiteSubscriptionDto>
{
    public async Task<Result<SuiteSubscriptionDto>> Handle(
        StartSuiteTrialCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var trial = SuiteTrialAccess.Resolve(borderBoxOptions);
        if (!trial.Enabled)
        {
            return Error.Validation("suite_trial.disabled", "Free trials are not available right now.");
        }

        if (trial.DurationDays <= 0)
        {
            return Error.Validation("suite_trial.misconfigured", "Trial duration is not configured.");
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
                "Complete your profile before starting your free trial.");
        }

        var existing = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        if (!await SuiteTrialAccess.IsEligibleAsync(
                user,
                existing,
                checkoutPayments,
                borderBoxOptions,
                clock,
                cancellationToken))
        {
            return Error.Validation(
                "suite_trial.not_eligible",
                "A free trial is not available for this account.");
        }

        var plan = await ResolveTrialPlanAsync(plans, cancellationToken);
        if (plan is null)
        {
            return Error.NotFound("suite_plan.not_found", "No suite plan is configured for trials.");
        }

        var activated = await SuiteSubscriptionActivator.ActivateTrialAsync(
            user,
            plan,
            trial.DurationDays,
            subscriptions,
            addresses,
            locations,
            platformConfig,
            suiteNumbers,
            unitOfWork,
            clock,
            cancellationToken);
        if (activated.IsFailure)
        {
            return activated;
        }

        await payLaterIntents.MarkResolvedAsync(user.Id, clock.UtcNow, cancellationToken);
        return activated;
    }

    private static async Task<SuitePlan?> ResolveTrialPlanAsync(
        ISuitePlanRepository plans,
        CancellationToken cancellationToken)
    {
        var catalogue = await plans.ListActiveAsync(cancellationToken);
        return catalogue.FirstOrDefault(p => p.DurationMonths == 1)
            ?? catalogue.OrderBy(p => p.DurationMonths).FirstOrDefault();
    }
}
