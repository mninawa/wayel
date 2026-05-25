using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Application.Features.Tracking;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Collection;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Collection;

public sealed record GetOpsCollectionBoardQuery(
    string? Search = null,
    string? HubCity = null,
    int Limit = 120)
    : IQuery<OpsCollectionBoardDto>;

internal sealed class GetOpsCollectionBoardQueryHandler(
    IShipmentCollectionRepository collections,
    IShipmentRepository shipments,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IParcelOpsPhotoRepository photos,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IPickupBranchRepository pickupBranches,
    IClock clock) : IQueryHandler<GetOpsCollectionBoardQuery, OpsCollectionBoardDto>
{
    private static readonly IReadOnlyList<(string Id, string Label, string Subtitle)> ColumnOrder =
    [
        (CollectionBoardColumns.InTransit, "In Transit", "Left RSA — en route to hub."),
        (CollectionBoardColumns.ReadyForCollection, "Ready for Collection", "Scanned in Eswatini — customer notified."),
        (CollectionBoardColumns.Collected, "Collected", "ID verified — handover complete."),
    ];

    public async Task<Result<OpsCollectionBoardDto>> Handle(
        GetOpsCollectionBoardQuery request,
        CancellationToken cancellationToken)
    {
        await BackfillMissingRecordsAsync(cancellationToken);

        var search = request.Search?.Trim();
        var hubFilter = request.HubCity?.Trim();
        var limit = Math.Clamp(request.Limit, 20, 300);

        var records = await collections.ListByStatusesAsync(
            [
                ShipmentCollectionStatuses.InTransit,
                ShipmentCollectionStatuses.ReadyForCollection,
                ShipmentCollectionStatuses.Collected,
            ],
            limit,
            cancellationToken);

        var hubOptions = records
            .Select(r => r.HubCity)
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(c => c, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var buckets = ColumnOrder.ToDictionary(
            c => c.Id,
            c => new List<OpsCollectionBoardCardDto>());

        foreach (var record in records)
        {
            var card = ToCard(record);
            if (!MatchesFilters(card, search, hubFilter))
            {
                continue;
            }

            if (buckets.TryGetValue(record.Status, out var list))
            {
                list.Add(card);
            }
        }

        await ApplyCoverPhotosAsync(buckets, cancellationToken);

        var columns = ColumnOrder
            .Select(c => new OpsCollectionBoardColumnDto(
                c.Id,
                c.Label,
                c.Subtitle,
                buckets[c.Id].Count,
                buckets[c.Id]
                    .OrderByDescending(x => x.EventAtUtc)
                    .Take(40)
                    .ToList()))
            .ToList();

        return new OpsCollectionBoardDto(columns, hubOptions);
    }

    private async Task BackfillMissingRecordsAsync(CancellationToken cancellationToken)
    {
        var packPage = await packingTasks.ListPageAsync(1, 200, null, cancellationToken);
        foreach (var pack in packPage.Items)
        {
            if (!string.Equals(
                    pack.DispatchStagingStatus,
                    DispatchStagingStatuses.Dispatched,
                    StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            await ShipmentCollectionProvisioner.EnsureInTransitAsync(
                pack.ShipmentId,
                shipments,
                pickTasks,
                packingTasks,
                users,
                addresses,
                pickupBranches,
                collections,
                clock,
  cancellationToken);
        }
    }

    private static OpsCollectionBoardCardDto ToCard(ShipmentCollectionRecord record) =>
        new(
            $"shipment:{record.ShipmentId:D}",
            record.Status,
            record.ShipmentId,
            record.ShipmentDisplayId,
            record.CustomerDisplayName,
            record.SuiteNumber,
            record.HubId,
            record.HubName,
            record.HubCity,
            record.ParcelCount,
            StatusLabel(record.Status),
            EventAt(record),
            record.ReadyForCollectionAtUtc,
            record.CollectedAtUtc,
            record.NotificationSentAtUtc is not null,
            record.CollectorIdType,
            MaskIdNumber(record.CollectorIdNumber));

    private async Task ApplyCoverPhotosAsync(
        Dictionary<string, List<OpsCollectionBoardCardDto>> buckets,
        CancellationToken cancellationToken)
    {
        var cards = buckets.Values.SelectMany(x => x).ToList();
        if (cards.Count == 0)
        {
            return;
        }

        var shipmentIds = cards.Select(c => c.ShipmentId).Distinct().ToList();
        var coverParcelByShipment = new Dictionary<Guid, Guid>();
        foreach (var shipmentId in shipmentIds)
        {
            var pick = await pickTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
            if (pick?.Parcels.Count > 0)
            {
                coverParcelByShipment[shipmentId] = pick.Parcels[0].ParcelId;
            }
        }

        if (coverParcelByShipment.Count == 0)
        {
            return;
        }

        var coverPhotos = await photos.ListLatestPhotoIdByParcelIdsAsync(
            coverParcelByShipment.Values.Distinct().ToList(),
            cancellationToken);

        var photoByShipment = coverParcelByShipment
            .Where(x => coverPhotos.ContainsKey(x.Value))
            .ToDictionary(x => x.Key, x => coverPhotos[x.Value]);

        foreach (var columnId in buckets.Keys.ToList())
        {
            buckets[columnId] = buckets[columnId]
                .Select(card => photoByShipment.TryGetValue(card.ShipmentId, out var photoId)
                    ? card with { CoverPhotoId = photoId }
                    : card)
                .ToList();
        }
    }

    private static string StatusLabel(string status) => status switch
    {
        ShipmentCollectionStatuses.InTransit => "In transit",
        ShipmentCollectionStatuses.ReadyForCollection => "Ready for collection",
        ShipmentCollectionStatuses.Collected => "Collected",
        _ => status.Replace('_', ' '),
    };

    private static DateTime EventAt(ShipmentCollectionRecord record) =>
        record.CollectedAtUtc
        ?? record.ReadyForCollectionAtUtc
        ?? record.DispatchedAtUtc;

    private static string? MaskIdNumber(string? idNumber)
    {
        if (string.IsNullOrWhiteSpace(idNumber))
        {
            return null;
        }

        var trimmed = idNumber.Trim();
        if (trimmed.Length <= 4)
        {
            return new string('*', trimmed.Length);
        }

        return new string('*', trimmed.Length - 4) + trimmed[^4..];
    }

    private static bool MatchesFilters(OpsCollectionBoardCardDto card, string? search, string? hubCity)
    {
        if (!string.IsNullOrWhiteSpace(hubCity)
            && !string.Equals(card.HubCity, hubCity, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(search))
        {
            return true;
        }

        var q = search.ToLowerInvariant();
        return card.DisplayId.Contains(q, StringComparison.OrdinalIgnoreCase)
            || card.CustomerDisplayName.Contains(q, StringComparison.OrdinalIgnoreCase)
            || (card.SuiteNumber?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)
            || card.HubName.Contains(q, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed record ScanOpsCollectionArrivalCommand(string ScanValue, string? HubCity = null)
    : ICommand<OpsCollectionScanResultDto>;

internal sealed class ScanOpsCollectionArrivalCommandHandler(
    IShipmentCollectionRepository collections,
    IShipmentRepository shipments,
    IParcelRepository parcels,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IPickupBranchRepository pickupBranches,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxEmailNotifier email,
    IBorderBoxInAppNotifier inApp,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ScanOpsCollectionArrivalCommand, OpsCollectionScanResultDto>
{
    public async Task<Result<OpsCollectionScanResultDto>> Handle(
        ScanOpsCollectionArrivalCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "collection.forbidden",
            "Your role cannot scan collection arrivals.");
        if (denied is not null)
        {
            return denied;
        }

        var scan = request.ScanValue?.Trim();
        if (string.IsNullOrWhiteSpace(scan))
        {
            return Error.Validation("collection.scan_required", "Scan or enter a shipment reference.");
        }

        var record = await ResolveRecordAsync(scan, cancellationToken);
        if (record is null)
        {
            return Error.NotFound("collection.not_found", "No dispatched shipment matched that scan.");
        }

        if (record.Status == ShipmentCollectionStatuses.Collected)
        {
            return Error.Validation("collection.already_collected", "This shipment was already collected.");
        }

        if (record.Status == ShipmentCollectionStatuses.ReadyForCollection)
        {
            return new OpsCollectionScanResultDto(
                record.ShipmentId,
                record.ShipmentDisplayId,
                record.Status,
                record.HubName,
                "Already marked ready for collection.",
                record.NotificationSentAtUtc is not null);
        }

        var now = clock.UtcNow;
        var hubCity = request.HubCity?.Trim();
        var updated = record with
        {
            Status = ShipmentCollectionStatuses.ReadyForCollection,
            ReadyForCollectionAtUtc = now,
            UpdatedAtUtc = now,
        };

        if (!string.IsNullOrWhiteSpace(hubCity)
            && !string.Equals(updated.HubCity, hubCity, StringComparison.OrdinalIgnoreCase))
        {
            var branches = await pickupBranches.ListActiveAsync(cancellationToken);
            var branch = branches.FirstOrDefault(b =>
                string.Equals(b.City, hubCity, StringComparison.OrdinalIgnoreCase));
            if (branch is not null)
            {
                updated = updated with
                {
                    HubId = branch.Id,
                    HubName = branch.Name,
                    HubCity = branch.City,
                };
            }
        }

        await collections.UpsertAsync(updated, cancellationToken);

        var shipment = await shipments.GetByIdAsync(new ShipmentId(record.ShipmentId), cancellationToken);
        if (shipment is not null)
        {
            var location = $"{updated.HubCity}, Eswatini";
            await trackingEvents.RecordReadyForCollectionAsync(
                shipment,
                location,
                $"Available for pickup at {updated.HubName}",
                cancellationToken);
        }

        var user = await users.GetByIdAsync(new UserId(record.UserId), cancellationToken);
        var notificationSent = false;
        if (user is not null)
        {
            await whatsApp.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            await email.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            await inApp.NotifyReadyForCollectionAsync(
                user,
                record.ShipmentId,
                record.ShipmentDisplayId,
                updated.HubName,
                updated.HubCity,
                cancellationToken);
            notificationSent = true;
            updated = updated with { NotificationSentAtUtc = now };
            await collections.UpsertAsync(updated, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsCollectionScanResultDto(
            record.ShipmentId,
            record.ShipmentDisplayId,
            ShipmentCollectionStatuses.ReadyForCollection,
            updated.HubName,
            $"Marked ready for collection at {updated.HubName}. Customer notified.",
            notificationSent);
    }

    private async Task<ShipmentCollectionRecord?> ResolveRecordAsync(
        string scan,
        CancellationToken cancellationToken)
    {
        var matches = await collections.SearchAsync(scan, 5, cancellationToken);
        if (matches.Count > 0)
        {
            return matches[0];
        }

        Guid? shipmentId = null;
        if (Guid.TryParse(scan, out var parsed))
        {
            shipmentId = parsed;
        }
        else if (scan.StartsWith("SHP-", StringComparison.OrdinalIgnoreCase))
        {
            var packPage = await packingTasks.ListPageAsync(1, 200, null, cancellationToken);
            var pack = packPage.Items.FirstOrDefault(p =>
                string.Equals(p.ShipmentDisplayId, scan, StringComparison.OrdinalIgnoreCase));
            shipmentId = pack?.ShipmentId;
        }

        if (shipmentId is null)
        {
            var recent = await parcels.ListRecentAsync(300, cancellationToken);
            var parcel = recent.FirstOrDefault(p =>
                !string.IsNullOrWhiteSpace(p.TrackingNumber)
                && string.Equals(p.TrackingNumber, scan, StringComparison.OrdinalIgnoreCase));
            if (parcel is not null)
            {
                var pick = await pickTasks.FindByParcelIdAsync(parcel.Id.Value, cancellationToken);
                shipmentId = pick?.ShipmentId;
            }
        }

        if (shipmentId is null)
        {
            return null;
        }

        var existing = await collections.GetByShipmentIdAsync(shipmentId.Value, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        return await ShipmentCollectionProvisioner.EnsureInTransitAsync(
            shipmentId.Value,
            shipments,
            pickTasks,
            packingTasks,
            users,
            addresses,
            pickupBranches,
            collections,
            clock,
            cancellationToken);
    }
}

public sealed record ConfirmOpsCollectionPickupCommand(
    Guid ShipmentId,
    string IdDocumentType,
    string IdNumber,
    string? CollectorName = null)
    : ICommand<OpsCollectionPickupResultDto>;

internal sealed class ConfirmOpsCollectionPickupCommandHandler(
    IShipmentCollectionRepository collections,
    IShipmentRepository shipments,
    IParcelRepository parcels,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ConfirmOpsCollectionPickupCommand, OpsCollectionPickupResultDto>
{
    public async Task<Result<OpsCollectionPickupResultDto>> Handle(
        ConfirmOpsCollectionPickupCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "collection.forbidden",
            "Your role cannot confirm collection pickup.");
        if (denied is not null)
        {
            return denied;
        }

        var idType = request.IdDocumentType?.Trim();
        var idNumber = request.IdNumber?.Trim();
        if (string.IsNullOrWhiteSpace(idType)
            || idType is not (CollectorIdDocumentTypes.NationalId or CollectorIdDocumentTypes.Passport))
        {
            return Error.Validation("collection.id_type_invalid", "Select National ID or Passport.");
        }

        if (string.IsNullOrWhiteSpace(idNumber) || idNumber.Length < 4)
        {
            return Error.Validation("collection.id_number_invalid", "Enter a valid ID or passport number.");
        }

        var record = await collections.GetByShipmentIdAsync(request.ShipmentId, cancellationToken);
        if (record is null)
        {
            return Error.NotFound("collection.not_found", "Shipment is not on the collection board.");
        }

        if (record.Status == ShipmentCollectionStatuses.Collected)
        {
            return Error.Validation("collection.already_collected", "This shipment was already collected.");
        }

        if (record.Status != ShipmentCollectionStatuses.ReadyForCollection)
        {
            return Error.Validation(
                "collection.not_ready",
                "Scan the shipment in Eswatini before confirming collection.");
        }

        var shipment = await shipments.GetByIdAsync(new ShipmentId(request.ShipmentId), cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        var now = clock.UtcNow;
        foreach (var parcelId in shipment.ParcelIds)
        {
            var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
            if (parcel is null)
            {
                continue;
            }

            var delivered = parcel.MarkDelivered();
            if (delivered.IsFailure)
            {
                return delivered.Error;
            }

            await parcels.UpdateAsync(parcel, cancellationToken);
        }

        shipment.MarkDelivered();
        await shipments.UpdateAsync(shipment, cancellationToken);

        var location = $"{record.HubCity}, Eswatini";
        await trackingEvents.RecordOpsStatusTransitionAsync(
            shipment,
            ShipmentStatus.Delivered,
            location,
            $"Collected at {record.HubName} — {idType} verified",
            cancellationToken);

        var updated = record with
        {
            Status = ShipmentCollectionStatuses.Collected,
            CollectedAtUtc = now,
            CollectorIdType = idType,
            CollectorIdNumber = idNumber,
            CollectorName = string.IsNullOrWhiteSpace(request.CollectorName)
                ? null
                : request.CollectorName.Trim(),
            RecordedByOpsUserId = ops.Actor,
            UpdatedAtUtc = now,
        };
        await collections.UpsertAsync(updated, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsCollectionPickupResultDto(
            request.ShipmentId,
            record.ShipmentDisplayId,
            "Collection confirmed. ID proof recorded.");
    }
}
