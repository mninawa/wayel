using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuitePlatform;

internal sealed class SuiteNumberAllocator(
    ISuitePlatformConfigRepository configRepository,
    ISuiteSubscriptionRepository subscriptions) : ISuiteNumberAllocator
{
    public async Task<string> ResolveAsync(
        User user,
        SuiteSubscription? existingSubscription,
        bool allocateNew,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(existingSubscription?.SuiteNumber))
        {
            return existingSubscription.SuiteNumber.Trim();
        }

        var region = SuitePlatformRegions.Normalize(user.DestinationCountry);
        var settings = await SuitePlatformConfigLoader.LoadAsync(configRepository, region, cancellationToken);

        if (settings.GenerationMode == SuiteNumberGenerationMode.Sequential)
        {
            if (!allocateNew)
            {
                return settings.FormatSequential(settings.NextSequenceNumber);
            }

            var assigned = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
            if (assigned >= settings.TotalSuiteCapacity)
            {
                throw new InvalidOperationException(
                    $"No suite numbers available for {SuitePlatformRegions.CorridorLabel(region)}. Increase regional capacity or retire inactive suites.");
            }

            var sequence = await configRepository.AllocateNextSequenceAsync(region, cancellationToken);
            return settings.FormatSequential(sequence);
        }

        if (allocateNew)
        {
            var assigned = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
            if (assigned >= settings.TotalSuiteCapacity)
            {
                throw new InvalidOperationException(
                    $"No suite numbers available for {SuitePlatformRegions.CorridorLabel(region)}. Increase regional capacity or retire inactive suites.");
            }
        }

        return settings.PreviewSuiteNumber(user.Id.Value);
    }
}
