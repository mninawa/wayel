using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuitePlatform;

public sealed record UpdateSuitePlatformConfigCommand(
    string RegionCode,
    bool IsActive,
    string WarehouseName,
    string AddressLine1,
    string? AddressLine2,
    string City,
    string Province,
    string PostalCode,
    string CountryCode,
    int TotalSuiteCapacity,
    string NumberPrefix,
    string GenerationMode,
    int UserIdSuffixLength,
    int SequencePadLength,
    long NextSequenceNumber) : ICommand<SuitePlatformConfigDto>;

internal sealed class UpdateSuitePlatformConfigCommandHandler(
    ISuitePlatformConfigRepository repository,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    ICustomerInAppNotificationRepository notifications,
    IClock clock) : ICommandHandler<UpdateSuitePlatformConfigCommand, SuitePlatformConfigDto>
{
    public async Task<Result<SuitePlatformConfigDto>> Handle(
        UpdateSuitePlatformConfigCommand request,
        CancellationToken cancellationToken)
    {
        var region = SuitePlatformRegions.Normalize(request.RegionCode);
        var previous = await repository.GetByRegionAsync(region, cancellationToken);

        if (string.IsNullOrWhiteSpace(request.WarehouseName)
            || string.IsNullOrWhiteSpace(request.AddressLine1)
            || string.IsNullOrWhiteSpace(request.City)
            || string.IsNullOrWhiteSpace(request.Province)
            || string.IsNullOrWhiteSpace(request.PostalCode)
            || string.IsNullOrWhiteSpace(request.CountryCode))
        {
            return Error.Validation("suite_platform.invalid_address", "Warehouse address fields are required.");
        }

        if (request.TotalSuiteCapacity < 1)
        {
            return Error.Validation("suite_platform.invalid_capacity", "Total suite capacity must be at least 1.");
        }

        var assigned = await subscriptions.CountAssignedSuitesByRegionAsync(region, cancellationToken);
        if (request.TotalSuiteCapacity < assigned)
        {
            return Error.Validation(
                "suite_platform.capacity_too_low",
                $"Capacity cannot be lower than assigned suites ({assigned}).");
        }

        if (string.IsNullOrWhiteSpace(request.NumberPrefix))
        {
            return Error.Validation("suite_platform.invalid_prefix", "Suite number prefix is required.");
        }

        if (!Enum.TryParse<SuiteNumberGenerationMode>(request.GenerationMode, true, out var mode))
        {
            return Error.Validation("suite_platform.invalid_mode", "Generation mode must be UserIdSuffix or Sequential.");
        }

        if (request.UserIdSuffixLength is < 4 or > 32)
        {
            return Error.Validation("suite_platform.invalid_suffix", "User ID suffix length must be between 4 and 32.");
        }

        if (request.SequencePadLength is < 4 or > 12)
        {
            return Error.Validation("suite_platform.invalid_pad", "Sequence pad length must be between 4 and 12.");
        }

        if (request.NextSequenceNumber < 1)
        {
            return Error.Validation("suite_platform.invalid_sequence", "Next sequence number must be at least 1.");
        }

        var settings = new SuitePlatformSettings(
            region,
            request.WarehouseName.Trim(),
            request.AddressLine1.Trim(),
            string.IsNullOrWhiteSpace(request.AddressLine2) ? null : request.AddressLine2.Trim(),
            request.City.Trim(),
            request.Province.Trim(),
            request.PostalCode.Trim(),
            request.CountryCode.Trim().ToUpperInvariant(),
            request.TotalSuiteCapacity,
            request.NumberPrefix.Trim().ToUpperInvariant(),
            mode,
            request.UserIdSuffixLength,
            request.SequencePadLength,
            request.NextSequenceNumber,
            request.IsActive,
            clock.UtcNow);

        await repository.SaveAsync(settings, cancellationToken);

        if (SuitePlatformWarehouseAddressSync.WarehouseAddressChanged(previous, settings))
        {
            await SuitePlatformWarehouseAddressSync.SyncStoredSuiteAddressesAsync(
                addresses,
                settings,
                cancellationToken);
            await SuitePlatformWarehouseAddressSync.NotifyActiveUsersOfWarehouseAddressChangeAsync(
                subscriptions,
                notifications,
                settings,
                cancellationToken);
        }

        var preview = mode == SuiteNumberGenerationMode.Sequential
            ? settings.FormatSequential(settings.NextSequenceNumber)
            : settings.PreviewSuiteNumber(new Guid("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));

        return settings.ToDto(assigned, preview);
    }
}
