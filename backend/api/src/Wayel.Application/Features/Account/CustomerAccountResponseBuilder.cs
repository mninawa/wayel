using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.BorderBox;
using Wayel.Application.Configuration;
using Wayel.Application.Features.Onboarding;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

internal sealed class CustomerAccountResponseBuilder(
    IUserRepository users,
    IUnitOfWork unitOfWork,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities,
    IPickupBranchRepository pickupBranches,
    ISuitePlatformConfigRepository suitePlatformConfig,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    IPayLaterIntentRepository payLaterIntents,
    Microsoft.Extensions.Options.IOptions<Wayel.Application.Configuration.BorderBoxOptions> borderBoxOptions,
    IOptions<KycOptions> kycOptions,
    Wayel.Application.Abstractions.Time.IClock clock)
{
    public async Task<CustomerAccountResponse> BuildAsync(User user, CancellationToken cancellationToken)
    {
        if (!kycOptions.Value.Enabled && user.KycStatus != KycStatus.Verified)
        {
            user.MarkKycVerified(clock.UtcNow);
            await users.UpdateAsync(user, cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, cancellationToken);
        var allAddresses = await addresses.ListForUserAsync(user.Id, cancellationToken);
        var linked = await identities.GetForUserAsync(user.Id, cancellationToken);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);
        var branches = await pickupBranches.ListAllAsync(cancellationToken);
        var platform = await SuitePlatformConfigLoader.LoadAsync(
            suitePlatformConfig,
            user.DestinationCountry,
            cancellationToken);
        var intent = await payLaterIntents.GetByUserAsync(user.Id, cancellationToken);
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var suiteTrial = await SuiteTrialAccess.BuildSnapshotAsync(
            user,
            subscription,
            checkoutPayments,
            borderBoxOptions,
            clock,
            cancellationToken);

        OnboardingIntentDto? intentDto = intent is { IsActive: true }
            ? new OnboardingIntentDto(
                "pay_later",
                intent.CreatedAtUtc.ToString("o"),
                intent.LastSeenAtUtc.ToString("o"),
                intent.PlanAtSignal?.Value.ToString(),
                intent.PlanAtSignalLabel)
            : null;

        return CustomerAccountMapper.Map(
            user,
            suiteAddress,
            allAddresses,
            hasGoogle,
            branches,
            platform.WarehouseName,
            intentDto,
            suiteTrial,
            kycOptions.Value.Enabled);
    }
}
