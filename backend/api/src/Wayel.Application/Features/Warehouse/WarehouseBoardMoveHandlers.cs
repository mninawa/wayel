using MediatR;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

public sealed record MoveOpsWarehouseBoardItemCommand(
    string CardKey,
    string FromColumnId,
    string ToColumnId,
    string? LocationId = null,
    string? Reason = null) : ICommand<OpsWarehouseBoardMoveResultDto>;

internal sealed class MoveOpsWarehouseBoardItemCommandHandler(
    IMediator mediator,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsActivityRepository activities,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IShipmentRepository shipments,
    IUserRepository users,
    IWarehouseLocationRepository locations,
    IWarehouseMovementRepository movements,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<MoveOpsWarehouseBoardItemCommand, OpsWarehouseBoardMoveResultDto>
{
    public async Task<Result<OpsWarehouseBoardMoveResultDto>> Handle(
        MoveOpsWarehouseBoardItemCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "warehouse.forbidden",
            "Your role cannot move board items.");
        if (denied is not null)
        {
            return denied;
        }

        if (!TryParseCardKey(request.CardKey, out var cardType, out var entityId))
        {
            return Error.Validation("board.invalid_card", "Invalid board card.");
        }

        var toColumn = request.ToColumnId.Trim().ToLowerInvariant();
        var fromColumn = request.FromColumnId.Trim().ToLowerInvariant();

        return cardType switch
        {
            "PARCEL" => await MoveParcelAsync(entityId, fromColumn, toColumn, request, cancellationToken),
            "SHIPMENT" => await MoveShipmentAsync(entityId, fromColumn, toColumn, cancellationToken),
            _ => Error.Validation("board.invalid_card", "Unsupported card type."),
        };
    }

    private async Task<Result<OpsWarehouseBoardMoveResultDto>> MoveParcelAsync(
        Guid parcelId,
        string fromColumn,
        string toColumn,
        MoveOpsWarehouseBoardItemCommand request,
        CancellationToken cancellationToken)
    {
        var parcel = await parcels.GetByIdAsync(new ParcelId(parcelId), cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
        var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
        var currentColumn = WarehouseBoardColumnResolver.ResolveParcelColumn(parcel, invoice, meta);

        if (!string.Equals(currentColumn, fromColumn, StringComparison.OrdinalIgnoreCase))
        {
            fromColumn = currentColumn;
        }

        if (!WarehouseBoardTransitionRules.IsAllowed("PARCEL", fromColumn, toColumn))
        {
            return Error.Validation(
                "board.invalid_transition",
                $"Cannot move parcel from {Label(fromColumn)} to {Label(toColumn)}.");
        }

        var blocker = await ValidateParcelMoveAsync(parcel, invoice, meta, fromColumn, toColumn, request, cancellationToken);
        if (blocker is not null)
        {
            return Error.Validation("board.blocked", blocker);
        }

        var now = clock.UtcNow;
        var actor = ops.Actor;

        switch (toColumn)
        {
            case WarehouseBoardColumns.Stored:
            {
                var storeLocationId = request.LocationId?.Trim()
                    ?? meta?.LocationId
                    ?? meta?.WarehouseLocation;
                if (string.IsNullOrWhiteSpace(storeLocationId) && !string.IsNullOrWhiteSpace(parcel.SuiteNumber))
                {
                    await SuiteLocationProvisioner.EnsureAsync(
                        parcel.SuiteNumber,
                        locations,
                        clock,
                        cancellationToken);
                    storeLocationId = WarehouseConstants.FormatSuiteLocationId(parcel.SuiteNumber);
                }

                await EnsureStoredAsync(parcel, meta, actor, now, storeLocationId, request.Reason, cancellationToken);
                break;
            }
            case WarehouseBoardColumns.ReadyForQuote:
            {
                var quote = await mediator.Send(new SendOpsParcelsToQuoteQueueCommand([parcelId]), cancellationToken);
                if (!quote.IsSuccess)
                {
                    return quote.Error!;
                }

                break;
            }
            case WarehouseBoardColumnResolver.ExceptionHold:
                await MoveToHoldAsync(parcelId, meta, actor, request.Reason, cancellationToken);
                break;
            case WarehouseBoardColumns.Received:
                await MoveToReceivingAsync(parcelId, meta, actor, cancellationToken);
                break;
            case WarehouseBoardColumns.PreparingDispatch:
            {
                var prep = await StartOpsDispatchPrepAsync(parcel, cancellationToken);
                if (prep.IsFailure)
                {
                    return prep.Error!;
                }

                break;
            }
            default:
                return Error.Validation("board.invalid_transition", "Unsupported parcel destination.");
        }

        await LogParcelMoveAsync(parcel.Id, fromColumn, toColumn, actor, now, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsWarehouseBoardMoveResultDto(
            $"Moved to {Label(toColumn)}.",
            fromColumn,
            toColumn);
    }

    private async Task<Result<OpsWarehouseBoardMoveResultDto>> MoveShipmentAsync(
        Guid shipmentId,
        string fromColumn,
        string toColumn,
        CancellationToken cancellationToken)
    {
        var pick = await pickTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
        var pack = await packingTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
        if (pick is null && pack is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment workflow not found.");
        }

        var currentColumn = WarehouseBoardColumnResolver.ResolveShipmentColumn(pick, pack);
        if (currentColumn is null)
        {
            return Error.Validation("board.invalid_state", "Shipment is not on the warehouse board.");
        }

        if (!string.Equals(currentColumn, fromColumn, StringComparison.OrdinalIgnoreCase))
        {
            fromColumn = currentColumn;
        }

        if (!WarehouseBoardTransitionRules.IsAllowed("SHIPMENT", fromColumn, toColumn))
        {
            return Error.Validation(
                "board.invalid_transition",
                $"Cannot move shipment from {Label(fromColumn)} to {Label(toColumn)}.");
        }

        switch (toColumn)
        {
            case WarehouseBoardColumns.Dispatched:
            {
                var prep = await EnsureShipmentReadyForDispatchAsync(shipmentId, pick, pack, cancellationToken);
                if (prep.IsFailure)
                {
                    return prep.Error!;
                }

                var dispatch = await mediator.Send(new DispatchOpsShipmentCommand(shipmentId), cancellationToken);
                if (!dispatch.IsSuccess)
                {
                    return dispatch.Error!;
                }

                return new OpsWarehouseBoardMoveResultDto(dispatch.Value!.Message, fromColumn, toColumn);
            }
            default:
                return Error.Validation("board.invalid_transition", "Unsupported shipment destination.");
        }
    }

    private async Task<string?> ValidateParcelMoveAsync(
        Parcel parcel,
        ParcelInvoice? invoice,
        ParcelOpsMetadata? meta,
        string fromColumn,
        string toColumn,
        MoveOpsWarehouseBoardItemCommand request,
        CancellationToken cancellationToken)
    {
        if (toColumn == WarehouseBoardColumns.Stored)
        {
            var locationId = request.LocationId?.Trim()
                ?? meta?.LocationId
                ?? meta?.WarehouseLocation;
            if (string.IsNullOrWhiteSpace(locationId) && !string.IsNullOrWhiteSpace(parcel.SuiteNumber))
            {
                var suiteLoc = await SuiteLocationProvisioner.EnsureAsync(
                    parcel.SuiteNumber,
                    locations,
                    clock,
                    cancellationToken);
                locationId = suiteLoc?.LocationId;
            }

            if (string.IsNullOrWhiteSpace(locationId))
            {
                return "Assign a storage location before moving to Stored.";
            }

            if (await locations.GetByIdAsync(locationId, cancellationToken) is null)
            {
                return "Storage location not found.";
            }
        }

        if (toColumn == WarehouseBoardColumns.ReadyForQuote)
        {
            var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
            if (readiness.State != "READY" && parcel.Status != ParcelStatus.ReadyToShip)
            {
                return $"Not ready for quote: missing {readiness.BlockersSummary}.";
            }
        }

        if (toColumn == WarehouseBoardColumns.PreparingDispatch)
        {
            if (parcel.Status != ParcelStatus.ReadyToShip)
            {
                return "Parcel must be ready for quote before starting dispatch prep.";
            }

            if (await pickTasks.FindByParcelIdAsync(parcel.Id.Value, cancellationToken) is not null)
            {
                return "This parcel is already in dispatch workflow — use the shipment card on the board.";
            }
        }

        return null;
    }

    private async Task<Result<Guid>> StartOpsDispatchPrepAsync(
        Parcel parcel,
        CancellationToken cancellationToken)
    {
        if (await pickTasks.FindByParcelIdAsync(parcel.Id.Value, cancellationToken) is not null)
        {
            return Error.Validation(
                "board.blocked",
                "This parcel is already in dispatch workflow — use the shipment card on the board.");
        }

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(parcel.UserId);
        }

        var userShipments = await shipments.ListForUserAsync(parcel.UserId, cancellationToken);
        var shipment = userShipments.FirstOrDefault(s =>
            s.Status == ShipmentStatus.Paid
            && s.ParcelIds.Contains(parcel.Id));

        if (shipment is null)
        {
            var creation = Shipment.Create(
                parcel.UserId,
                [parcel.Id],
                "Standard",
                shipOutLocked: false,
                lockReason: null);
            if (creation.IsFailure)
            {
                return Result.Failure<Guid>(creation.Error!);
            }

            shipment = creation.Value;
            shipment.MarkQuoted();
            shipment.MarkAwaitingApproval();
            shipment.MarkPaid();
            await shipments.AddAsync(shipment, cancellationToken);
        }

        var mark = parcel.MarkInShipment();
        if (mark.IsFailure)
        {
            return Result.Failure<Guid>(mark.Error!);
        }

        await parcels.UpdateAsync(parcel, cancellationToken);
        await WarehouseTaskCreator.CreateForPaidShipmentAsync(
            shipment,
            user,
            parcels,
            opsMetadata,
            pickTasks,
            packingTasks,
            clock,
            cancellationToken);

        return shipment.Id.Value;
    }

    private async Task<Result> EnsureShipmentReadyForDispatchAsync(
        Guid shipmentId,
        PickTaskRecord? pick,
        PackingTaskRecord? pack,
        CancellationToken cancellationToken)
    {
        if (pick is not null && pick.Status != PickTaskStatuses.Picked)
        {
            var now = clock.UtcNow;
            var lines = pick.Parcels.Select(p => p with
            {
                PickStatus = PickParcelStatuses.Picked,
                PickedBy = ops.Actor,
                PickedAtUtc = now,
            }).ToList();
            await pickTasks.UpdateAsync(
                pick with
                {
                    Parcels = lines,
                    Status = PickTaskStatuses.Picked,
                    AssignedTo = ops.Actor,
                    CompletedAtUtc = now,
                },
                cancellationToken);
            await unitOfWork.SaveChangesAsync(cancellationToken);
        }

        pack = await packingTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
        if (pack is null)
        {
            return Error.Validation("board.blocked", "Packing task not found for shipment.");
        }

        if (pack.DispatchStagingStatus != DispatchStagingStatuses.ReadyForDispatch)
        {
            var weight = pack.FinalWeightKg ?? pack.QuotedWeightKg ?? 1m;
            var dims = pack.FinalDimensionsLabel ?? "30x20x15";
            var complete = await mediator.Send(
                new CompleteOpsPackingTaskCommand(
                    pack.PackingTaskId,
                    weight,
                    dims,
                    pack.PackagingType ?? "Standard box",
                    Math.Max(1, pack.PackageCount),
                    pack.Notes),
                cancellationToken);
            if (!complete.IsSuccess)
            {
                return complete.Error!;
            }
        }

        return Result.Success();
    }

    private async Task EnsureStoredAsync(
        Parcel parcel,
        ParcelOpsMetadata? meta,
        string? actor,
        DateTime now,
        string? requestedLocationId,
        string? notes,
        CancellationToken cancellationToken)
    {
        var locationId = requestedLocationId?.Trim()
            ?? meta?.LocationId
            ?? meta?.WarehouseLocation;
        if (string.IsNullOrWhiteSpace(locationId))
        {
            return;
        }

        if (meta is not null
            && string.Equals(meta.WarehouseStatus, ParcelWarehouseStatuses.Stored, StringComparison.OrdinalIgnoreCase)
            && string.Equals(meta.LocationId, locationId, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var from = meta?.LocationId ?? meta?.WarehouseLocation;
        await WarehouseMovementWriter.MoveParcelAsync(
            parcel.Id.Value,
            from,
            locationId,
            WarehouseMovementTypes.InitialStorage,
            notes ?? "Kanban move to Stored",
            actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);
    }

    private async Task MoveToHoldAsync(
        Guid parcelId,
        ParcelOpsMetadata? meta,
        string? actor,
        string? reason,
        CancellationToken cancellationToken)
    {
        var from = meta?.LocationId ?? meta?.WarehouseLocation;
        await WarehouseMovementWriter.MoveParcelAsync(
            parcelId,
            from,
            WarehouseConstants.ReceivingBayLocationId,
            WarehouseMovementTypes.ToHold,
            reason ?? "Moved to hold from warehouse board",
            actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);
    }

    private async Task MoveToReceivingAsync(
        Guid parcelId,
        ParcelOpsMetadata? meta,
        string? actor,
        CancellationToken cancellationToken)
    {
        var from = meta?.LocationId ?? meta?.WarehouseLocation;
        await WarehouseMovementWriter.MoveParcelAsync(
            parcelId,
            from,
            WarehouseConstants.ReceivingBayLocationId,
            WarehouseMovementTypes.Relocate,
            "Returned to receiving from warehouse board",
            actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);

        var existing = await opsMetadata.GetForParcelAsync(new ParcelId(parcelId), cancellationToken);
        if (existing is null)
        {
            return;
        }

        await opsMetadata.UpsertAsync(
            existing with
            {
                WarehouseStatus = ParcelWarehouseStatuses.NotStored,
                UpdatedAtUtc = clock.UtcNow,
            },
            cancellationToken);
    }

    private async Task LogParcelMoveAsync(
        ParcelId parcelId,
        string fromColumn,
        string toColumn,
        string? actor,
        DateTime now,
        CancellationToken cancellationToken) =>
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "WAREHOUSE_BOARD_MOVE",
            $"Moved to {Label(toColumn)}",
            $"From {Label(fromColumn)} to {Label(toColumn)}",
            actor,
            now,
            cancellationToken);

    private static bool TryParseCardKey(string cardKey, out string cardType, out Guid entityId)
    {
        cardType = "";
        entityId = Guid.Empty;
        var parts = cardKey.Split(':', 2);
        if (parts.Length != 2 || !Guid.TryParse(parts[1], out entityId))
        {
            return false;
        }

        cardType = parts[0].ToUpperInvariant();
        return cardType is "PARCEL" or "SHIPMENT";
    }

    private static string Label(string columnId) =>
        columnId switch
        {
            WarehouseBoardColumns.Received => "Received",
            WarehouseBoardColumns.Stored => "Stored",
            WarehouseBoardColumns.ReadyForQuote => "Ready for Quote",
            WarehouseBoardColumns.PreparingDispatch => "Preparing Dispatch",
            WarehouseBoardColumns.Picking => "Picking",
            WarehouseBoardColumns.Packing => "Packing",
            WarehouseBoardColumns.DispatchStaging => "Dispatch Staging",
            WarehouseBoardColumns.Dispatched => "Dispatched",
            WarehouseBoardColumnResolver.ExceptionHold => "Exception / Hold",
            _ => columnId,
        };
}

public sealed record GetOpsWarehouseBoardTransitionsQuery(string CardKey, string FromColumnId)
    : IQuery<OpsWarehouseBoardTransitionsDto>;

internal sealed class GetOpsWarehouseBoardTransitionsQueryHandler
    : IQueryHandler<GetOpsWarehouseBoardTransitionsQuery, OpsWarehouseBoardTransitionsDto>
{
    public Task<Result<OpsWarehouseBoardTransitionsDto>> Handle(
        GetOpsWarehouseBoardTransitionsQuery request,
        CancellationToken cancellationToken)
    {
        if (!TryParseCardKey(request.CardKey, out var cardType, out _))
        {
            return Task.FromResult<Result<OpsWarehouseBoardTransitionsDto>>(
                Error.Validation("board.invalid_card", "Invalid board card."));
        }

        var targets = WarehouseBoardTransitionRules.AllowedTargets(cardType, request.FromColumnId.Trim().ToLowerInvariant());
        return Task.FromResult<Result<OpsWarehouseBoardTransitionsDto>>(
            new OpsWarehouseBoardTransitionsDto(request.FromColumnId, targets.ToList()));
    }

    private static bool TryParseCardKey(string cardKey, out string cardType, out Guid entityId)
    {
        cardType = "";
        entityId = Guid.Empty;
        var parts = cardKey.Split(':', 2);
        if (parts.Length != 2 || !Guid.TryParse(parts[1], out entityId))
        {
            return false;
        }

        cardType = parts[0].ToUpperInvariant();
        return cardType is "PARCEL" or "SHIPMENT";
    }
}
