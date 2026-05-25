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

namespace Wayel.Application.Features.Collection;

public sealed record MoveOpsCollectionBoardItemCommand(
    Guid ShipmentId,
    string FromColumnId,
    string ToColumnId,
    string? HubCity = null)
    : ICommand<OpsCollectionMoveResultDto>;

internal sealed class MoveOpsCollectionBoardItemCommandHandler(
    IShipmentCollectionRepository collections,
    IShipmentRepository shipments,
    IPickupBranchRepository pickupBranches,
    IUserRepository users,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxEmailNotifier email,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<MoveOpsCollectionBoardItemCommand, OpsCollectionMoveResultDto>
{
    public async Task<Result<OpsCollectionMoveResultDto>> Handle(
        MoveOpsCollectionBoardItemCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "collection.forbidden",
            "Your role cannot move collection board items.");
        if (denied is not null)
        {
            return denied;
        }

        if (!CollectionBoardTransitionRules.CanTransition(request.FromColumnId, request.ToColumnId))
        {
            return Error.Validation(
                "collection.move_invalid",
                CollectionBoardTransitionRules.DropBlockedMessage(request.FromColumnId, request.ToColumnId));
        }

        if (request.ToColumnId == ShipmentCollectionStatuses.Collected)
        {
            return Error.Validation(
                "collection.pickup_required",
                "Record ID proof using the Collect action to complete handover.");
        }

        var record = await collections.GetByShipmentIdAsync(request.ShipmentId, cancellationToken);
        if (record is null)
        {
            return Error.NotFound("collection.not_found", "Shipment is not on the collection board.");
        }

        if (!string.Equals(record.Status, request.FromColumnId, StringComparison.OrdinalIgnoreCase))
        {
            return Error.Validation("collection.stale_column", "Board changed — refresh and try again.");
        }

        if (request.ToColumnId == ShipmentCollectionStatuses.ReadyForCollection)
        {
            var (updated, notified) = await CollectionStatusTransitions.MarkReadyForCollectionAsync(
                record,
                request.HubCity,
                shipments,
                pickupBranches,
                users,
                whatsApp,
                email,
                trackingEvents,
                clock,
                collections,
                cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
            return new OpsCollectionMoveResultDto(
                updated.ShipmentId,
                updated.ShipmentDisplayId,
                updated.Status,
                $"Marked ready for collection at {updated.HubName}.",
                notified);
        }

        var reverted = await CollectionStatusTransitions.RevertToInTransitAsync(
            record,
            clock,
            collections,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new OpsCollectionMoveResultDto(
            reverted.ShipmentId,
            reverted.ShipmentDisplayId,
            reverted.Status,
            "Moved back to in transit.",
            false);
    }
}

public sealed record BulkAdvanceOpsCollectionColumnCommand(
    string ColumnId,
    string? HubCity = null)
    : ICommand<OpsCollectionBulkAdvanceResultDto>;

internal sealed class BulkAdvanceOpsCollectionColumnCommandHandler(
    IShipmentCollectionRepository collections,
    IShipmentRepository shipments,
    IPickupBranchRepository pickupBranches,
    IUserRepository users,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxEmailNotifier email,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<BulkAdvanceOpsCollectionColumnCommand, OpsCollectionBulkAdvanceResultDto>
{
    public async Task<Result<OpsCollectionBulkAdvanceResultDto>> Handle(
        BulkAdvanceOpsCollectionColumnCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "collection.forbidden",
            "Your role cannot bulk-advance collection items.");
        if (denied is not null)
        {
            return denied;
        }

        var next = CollectionBoardTransitionRules.NextColumnId(request.ColumnId);
        if (next is null)
        {
            return Error.Validation(
                "collection.bulk_not_supported",
                "Bulk advance is not available for this column.");
        }

        if (next == ShipmentCollectionStatuses.Collected)
        {
            return Error.Validation(
                "collection.bulk_pickup_required",
                "Collect each shipment individually and record ID proof.");
        }

        var records = await collections.ListByStatusesAsync([request.ColumnId], 500, cancellationToken);
        if (!string.IsNullOrWhiteSpace(request.HubCity))
        {
            records = records
                .Where(r => string.Equals(r.HubCity, request.HubCity, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var moved = 0;
        var skipped = 0;
        foreach (var record in records)
        {
            if (record.Status != request.ColumnId)
            {
                skipped++;
                continue;
            }

            try
            {
                await CollectionStatusTransitions.MarkReadyForCollectionAsync(
                    record,
                    request.HubCity,
                    shipments,
                    pickupBranches,
                    users,
                    whatsApp,
                    email,
                    trackingEvents,
                    clock,
                    collections,
                    cancellationToken);
                moved++;
            }
            catch (InvalidOperationException)
            {
                skipped++;
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var hubNote = string.IsNullOrWhiteSpace(request.HubCity) ? "" : $" ({request.HubCity} hub)";
        return new OpsCollectionBulkAdvanceResultDto(
            moved,
            skipped,
            moved > 0
                ? $"Moved {moved} shipment{(moved == 1 ? "" : "s")} to ready for collection{hubNote}."
                : "No shipments were moved.");
    }
}
