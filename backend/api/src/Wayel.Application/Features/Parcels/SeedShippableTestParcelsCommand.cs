using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record SeedShippableTestParcelsResultDto(
    int Created,
    int TotalShippable,
    string Dataset,
    string Message);

public sealed record SeedShippableTestParcelsCommand(string? Dataset = null)
    : ICommand<SeedShippableTestParcelsResultDto>;

internal sealed class SeedShippableTestParcelsCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<SeedShippableTestParcelsCommand, SeedShippableTestParcelsResultDto>
{
    public async Task<Result<SeedShippableTestParcelsResultDto>> Handle(
        SeedShippableTestParcelsCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var datasetKey = TestParcelCatalogs.NormalizeDataset(request.Dataset);
        if (!TestParcelCatalogs.TryGetTemplates(datasetKey, out var templates, out var displayName))
        {
            return Error.Validation(
                "parcel.seed_unknown_dataset",
                "Unknown dataset. Use catalog-a or catalog-b.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        if (subscription is null || string.IsNullOrWhiteSpace(subscription.SuiteNumber))
        {
            return Error.Validation(
                "parcel.seed_no_suite",
                "Assign a suite number before seeding test parcels (complete suite checkout).");
        }

        var suite = subscription.SuiteNumber.Trim();
        var existing = await parcels.ListForUserAsync(user.Id, cancellationToken);
        var shippableCount = existing.Count(IsShippable);

        var usedTracking = existing
            .Select(p => p.TrackingNumber)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var created = 0;
        var now = clock.UtcNow;
        var dayOffset = shippableCount;

        foreach (var template in templates)
        {
            if (usedTracking.Contains(template.Tracking))
            {
                continue;
            }

            var parcel = Parcel.Rehydrate(
                ParcelId.New(),
                user.Id,
                suite,
                template.Retailer,
                template.Tracking,
                template.Item,
                template.Category,
                template.Value,
                template.Dims,
                template.Status,
                template.WeightKg,
                now.AddDays(-(dayOffset + created + 1)));

            await parcels.AddAsync(parcel, cancellationToken);
            usedTracking.Add(template.Tracking);
            created++;

            if (template.WithInvoice)
            {
                var invoice = ParcelInvoice.Upload(
                    parcel.Id,
                    user.Id,
                    $"{template.Retailer.ToLowerInvariant().Replace(" ", "-")}-invoice.pdf",
                    180_000,
                    now.AddDays(-(dayOffset + created)));

                var suiteFolder = ParcelInvoiceStoragePaths.SanitizeSuiteFolder(suite);
                invoice.AttachStorage(
                    $"{suiteFolder}/invoices/{parcel.Id.Value:D}/seed.pdf",
                    "application/pdf");
                await invoices.AddAsync(invoice, cancellationToken);
            }
        }

        if (created == 0)
        {
            return new SeedShippableTestParcelsResultDto(
                0,
                shippableCount,
                datasetKey,
                $"All parcels from {displayName} are already on your account.");
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var totalShippable = shippableCount + created;
        return new SeedShippableTestParcelsResultDto(
            created,
            totalShippable,
            datasetKey,
            $"Added {created} parcel(s) from {displayName} for suite {suite}. You now have {totalShippable} ready to ship.");
    }

    private static bool IsShippable(Parcel p) =>
        p.Status is ParcelStatus.Received
            or ParcelStatus.AwaitingInvoice
            or ParcelStatus.ReadyToShip;
}
