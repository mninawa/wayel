using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Ops command to change a customer's suite number when the format changes,
/// a legacy placeholder was persisted, or collection/warehouse data is stale.
/// </summary>
public sealed record UpdateCustomerSuiteNumberCommand(
    Guid UserId,
    string? NewSuiteNumber,
    bool RegenerateFromPool) : ICommand<UpdateCustomerSuiteNumberResult>;

public sealed record UpdateCustomerSuiteNumberResult(
    Guid UserId,
    string PreviousSuiteNumber,
    string NewSuiteNumber);

internal sealed class UpdateCustomerSuiteNumberCommandHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISuitePlatformConfigRepository platformConfig,
    ISuiteNumberPoolRepository pool,
    ISuiteNumberAllocator allocator,
    CustomerSuiteNumberChanger suiteNumberChanger,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<UpdateCustomerSuiteNumberCommandHandler> logger)
    : ICommandHandler<UpdateCustomerSuiteNumberCommand, UpdateCustomerSuiteNumberResult>
{
    public async Task<Result<UpdateCustomerSuiteNumberResult>> Handle(
        UpdateCustomerSuiteNumberCommand request,
        CancellationToken cancellationToken)
    {
        var userId = new UserId(request.UserId);
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(userId);
        }

        var subscription = await subscriptions.GetForUserAsync(userId, cancellationToken);
        if (subscription is null)
        {
            return Error.NotFound("suite_subscription.not_found", "User has no suite subscription.");
        }

        var previous = subscription.SuiteNumber?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(previous))
        {
            return Error.Validation(
                "suite_subscription.no_number",
                "Subscription has no suite number yet — let the customer complete checkout first.");
        }

        var region = SuitePlatformRegions.Normalize(user.DestinationCountry);
        var settings = await SuitePlatformConfigLoader.LoadAsync(platformConfig, region, cancellationToken);
        var now = clock.UtcNow;

        string newNumber;
        if (request.RegenerateFromPool || string.IsNullOrWhiteSpace(request.NewSuiteNumber))
        {
            try
            {
                newNumber = await allocator.ResolveAsync(
                    user,
                    existingSubscription: null,
                    allocateNew: true,
                    cancellationToken);
            }
            catch (InvalidOperationException ex)
            {
                return Error.Validation("suite_platform.capacity_exhausted", ex.Message);
            }
        }
        else
        {
            var explicitResult = await ResolveExplicitNumberAsync(
                request.NewSuiteNumber,
                user,
                region,
                now,
                cancellationToken);
            if (explicitResult.IsFailure)
            {
                return explicitResult.Error;
            }

            newNumber = explicitResult.Value;
        }

        if (string.Equals(previous, newNumber, StringComparison.Ordinal))
        {
            return Error.Validation(
                "suite_subscription.update_noop",
                "The new suite number is the same as the current one.");
        }

        await suiteNumberChanger.ApplyAsync(user, previous, newNumber, region, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogWarning(
            "Ops updated suite number for {UserId}: {Previous} → {New}",
            userId.Value,
            previous,
            newNumber);

        return new UpdateCustomerSuiteNumberResult(userId.Value, previous, newNumber);
    }

    private async Task<Result<string>> ResolveExplicitNumberAsync(
        string raw,
        User user,
        string region,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var normalized = raw.Trim().ToUpperInvariant();
        if (normalized.Length < 4 || normalized.Length > 32)
        {
            return Error.Validation(
                "suite_number.invalid",
                "Suite number must be between 4 and 32 characters.");
        }

        if (!normalized.Contains('-', StringComparison.Ordinal))
        {
            return Error.Validation(
                "suite_number.invalid",
                "Suite number should use the configured prefix format, e.g. SZ-1A2B3C4D.");
        }

        var ownedByOther = await subscriptions.GetBySuiteNumberAsync(normalized, cancellationToken);
        if (ownedByOther is not null && ownedByOther.UserId != user.Id)
        {
            return Error.Validation(
                "suite_number.taken",
                $"Suite number {normalized} is already assigned to another customer.");
        }

        var existingPool = await pool.GetByUserAsync(user.Id, cancellationToken);
        if (existingPool is not null && string.Equals(existingPool.Number, normalized, StringComparison.Ordinal))
        {
            return normalized;
        }

        var claimed = await pool.TryClaimSpecificAsync(region, normalized, user.Id, nowUtc, cancellationToken);
        if (claimed is not null)
        {
            return claimed.Number;
        }

        if (await pool.EnsureAssignedAsync(region, normalized, user.Id, nowUtc, cancellationToken))
        {
            return normalized;
        }

        return Error.Validation(
            "suite_number.unavailable",
            $"Suite number {normalized} could not be claimed — it may already be reserved in the pool.");
    }
}
