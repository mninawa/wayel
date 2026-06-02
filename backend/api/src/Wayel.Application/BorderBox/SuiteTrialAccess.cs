using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Account;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.BorderBox;

internal static class SuiteTrialAccess
{
    public static BorderBoxTrialAccessOptions Resolve(IOptions<BorderBoxOptions> options) =>
        options.Value.TrialAccess ?? new BorderBoxTrialAccessOptions();

    public static async Task<SuiteTrialDto> BuildSnapshotAsync(
        User user,
        SuiteSubscription? subscription,
        ISuiteCheckoutPaymentRepository checkoutPayments,
        IOptions<BorderBoxOptions> options,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var trial = Resolve(options);
        var eligible = await IsEligibleAsync(user, subscription, checkoutPayments, options, clock, cancellationToken);
        subscription?.RefreshStatus(clock.UtcNow);

        var isActive = subscription is { IsTrial: true }
            && SuiteCheckoutBilling.IsWithinPaidPeriod(subscription, clock.UtcNow);

        return new SuiteTrialDto(
            trial.Enabled,
            trial.DurationDays,
            eligible,
            isActive,
            isActive ? subscription!.ExpiresAt?.ToString("o") : null);
    }

    public static async Task<bool> IsEligibleAsync(
        User user,
        SuiteSubscription? subscription,
        ISuiteCheckoutPaymentRepository checkoutPayments,
        IOptions<BorderBoxOptions> options,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var trial = Resolve(options);
        if (!trial.Enabled || trial.DurationDays <= 0)
        {
            return false;
        }

        if (!CustomerProfileRules.IsComplete(user))
        {
            return false;
        }

        if (subscription?.StartedAt is not null)
        {
            return false;
        }

        if (SuiteCheckoutBilling.IsWithinPaidPeriod(subscription, clock.UtcNow))
        {
            return false;
        }

        var completedPayments = await checkoutPayments.CountCompletedForUserAsync(user.Id, cancellationToken);
        return completedPayments == 0;
    }
}
