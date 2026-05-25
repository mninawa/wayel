using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Application.Features.Tracking;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;

namespace Wayel.Application.Features.Parcels;

public sealed record ListOpsConsolidationReadyShipmentsQuery(
    int Page = 1,
    int PageSize = OpsListPagination.DefaultPageSize,
    string? Stage = null)
    : IQuery<OpsPagedResult<OpsConsolidationReadyShipmentDto>>;

internal sealed class ListOpsConsolidationReadyShipmentsQueryHandler(
    IShipmentRepository shipments,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelOpsMetadataRepository opsMetadata,
    IShipmentTrackingEventRepository trackingEvents) : IQueryHandler<ListOpsConsolidationReadyShipmentsQuery, OpsPagedResult<OpsConsolidationReadyShipmentDto>>
{
    public async Task<Result<OpsPagedResult<OpsConsolidationReadyShipmentDto>>> Handle(
        ListOpsConsolidationReadyShipmentsQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var stage = NormalizeStage(request.Stage);
        var (items, total) = stage is null
            ? await LoadPageAsync(page, pageSize, null, cancellationToken)
            : await LoadFilteredPageAsync(page, pageSize, stage, cancellationToken);

        return new OpsPagedResult<OpsConsolidationReadyShipmentDto>(items, total, page, pageSize);
    }

    private async Task<(List<OpsConsolidationReadyShipmentDto> Items, int Total)> LoadPageAsync(
        int page,
        int pageSize,
        string? stage,
        CancellationToken cancellationToken)
    {
        var pageResult = await shipments.ListByStatusPageAsync(
            ShipmentStatus.Paid,
            page,
            pageSize,
            cancellationToken);

        var mapped = new List<OpsConsolidationReadyShipmentDto>();
        foreach (var shipment in pageResult.Items)
        {
            var dto = await MapShipmentAsync(shipment, cancellationToken);
            if (MatchesStage(dto.ReadyForDispatch, stage))
            {
                mapped.Add(dto);
            }
        }

        return (mapped, pageResult.TotalCount);
    }

    private async Task<(List<OpsConsolidationReadyShipmentDto> Items, int Total)> LoadFilteredPageAsync(
        int page,
        int pageSize,
        string stage,
        CancellationToken cancellationToken)
    {
        const int scanBatch = 25;
        var matched = new List<OpsConsolidationReadyShipmentDto>();
        var scanPage = 1;
        var total = 0;

        while (true)
        {
            var batch = await shipments.ListByStatusPageAsync(
                ShipmentStatus.Paid,
                scanPage,
                scanBatch,
                cancellationToken);
            if (batch.Items.Count == 0)
            {
                break;
            }

            foreach (var shipment in batch.Items)
            {
                var dto = await MapShipmentAsync(shipment, cancellationToken);
                if (!MatchesStage(dto.ReadyForDispatch, stage))
                {
                    continue;
                }

                total++;
                var skip = (page - 1) * pageSize;
                if (total > skip && matched.Count < pageSize)
                {
                    matched.Add(dto);
                }
            }

            if (batch.Items.Count < scanBatch)
            {
                break;
            }

            scanPage++;
        }

        return (matched, total);
    }

    private static string? NormalizeStage(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "awaiting_pack" or "awaiting-pack" => "awaiting_pack",
            "ready" or "ready_for_dispatch" or "ready-for-dispatch" => "ready",
            _ => null,
        };
    }

    private static bool MatchesStage(bool readyForDispatch, string? stage) =>
        stage switch
        {
            "awaiting_pack" => !readyForDispatch,
            "ready" => readyForDispatch,
            _ => true,
        };

    private async Task<OpsConsolidationReadyShipmentDto> MapShipmentAsync(
        Shipment shipment,
        CancellationToken cancellationToken)
    {
        var user = await users.GetByIdAsync(shipment.UserId, cancellationToken);
        var pickParcels = new List<OpsConsolidationPickParcelDto>();
        decimal totalWeight = 0;
        string? suite = null;

        foreach (var parcelId in shipment.ParcelIds)
        {
            var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
            if (parcel is null)
            {
                continue;
            }

            suite ??= parcel.SuiteNumber;
            if (parcel.WeightKg is > 0)
            {
                totalWeight += parcel.WeightKg.Value;
            }

            var meta = await opsMetadata.GetForParcelAsync(parcelId, cancellationToken);
            pickParcels.Add(new OpsConsolidationPickParcelDto(
                parcelId.Value,
                OpsParcelDisplayIds.Format(parcel),
                parcel.ItemName,
                meta?.WarehouseLocation,
                parcel.WeightKg));
        }

        var events = await trackingEvents.ListForShipmentAsync(shipment.Id, cancellationToken);
        var ready = events.Any(e =>
            string.Equals(e.EventType, ShipmentTrackingEventTypes.ReadyForDispatch, StringComparison.Ordinal));
        var paidAt = events
            .Where(e => string.Equals(e.EventType, ShipmentTrackingEventTypes.PaymentReceived, StringComparison.Ordinal))
            .Select(e => (DateTime?)e.OccurredAtUtc)
            .FirstOrDefault();

        return new OpsConsolidationReadyShipmentDto(
            shipment.Id.Value,
            user?.DisplayName ?? "Customer",
            suite ?? "—",
            shipment.DeliveryMethod,
            pickParcels.Count,
            totalWeight,
            ready,
            paidAt,
            pickParcels);
    }
}

public sealed record MarkOpsConsolidationShipmentPackedCommand(
    Guid ShipmentId,
    string? Notes) : ICommand<MarkOpsConsolidationPackedResultDto>;

internal sealed class MarkOpsConsolidationShipmentPackedCommandHandler(
    IShipmentRepository shipments,
    IParcelOpsActivityRepository activities,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<MarkOpsConsolidationShipmentPackedCommand, MarkOpsConsolidationPackedResultDto>
{
    public async Task<Result<MarkOpsConsolidationPackedResultDto>> Handle(
        MarkOpsConsolidationShipmentPackedCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanInspect(ops.Role),
            "ops.consolidation.forbidden",
            "Your role cannot mark shipments as packed.");
        if (denied is not null)
        {
            return denied;
        }

        var shipmentId = new ShipmentId(request.ShipmentId);
        var shipment = await shipments.GetByIdAsync(shipmentId, cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        if (shipment.Status != ShipmentStatus.Paid)
        {
            return Error.Validation(
                "consolidation.invalid_status",
                "Only paid shipments awaiting dispatch can be marked packed.");
        }

        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        var now = clock.UtcNow;

        foreach (var parcelId in shipment.ParcelIds)
        {
            await OpsParcelActivityWriter.LogAsync(
                activities,
                parcelId,
                "PACKED_FOR_DISPATCH",
                "Packed for outbound dispatch",
                notes,
                ops.Actor,
                now,
                cancellationToken);
        }

        await trackingEvents.RecordReadyForDispatchAsync(
            shipment,
            notes,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new MarkOpsConsolidationPackedResultDto(
            shipmentId.Value,
            true,
            "Shipment marked packed and ready for courier dispatch.");
    }
}

public sealed record CreateOpsConsolidationDispatchBatchCommand(
    IReadOnlyList<Guid> ShipmentIds,
    string? CourierReference) : ICommand<OpsConsolidationDispatchBatchResultDto>;

internal sealed class CreateOpsConsolidationDispatchBatchCommandHandler(
    IShipmentRepository shipments,
    IShipmentTrackingEventRepository trackingEvents,
    ShipmentTrackingEventWriter trackingWriter,
    IOpsCallerContext ops,
    IUnitOfWork unitOfWork) : ICommandHandler<CreateOpsConsolidationDispatchBatchCommand, OpsConsolidationDispatchBatchResultDto>
{
    public async Task<Result<OpsConsolidationDispatchBatchResultDto>> Handle(
        CreateOpsConsolidationDispatchBatchCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanInspect(ops.Role),
            "ops.consolidation.forbidden",
            "Your role cannot dispatch shipments.");
        if (denied is not null)
        {
            return denied;
        }

        if (request.ShipmentIds.Count == 0)
        {
            return Error.Validation("dispatch.empty", "Select at least one shipment.");
        }

        var dispatched = new List<Guid>();
        var courierRef = string.IsNullOrWhiteSpace(request.CourierReference)
            ? null
            : request.CourierReference.Trim();

        foreach (var id in request.ShipmentIds.Distinct())
        {
            var shipmentId = new ShipmentId(id);
            var shipment = await shipments.GetByIdAsync(shipmentId, cancellationToken);
            if (shipment is null)
            {
                continue;
            }

            if (shipment.Status != ShipmentStatus.Paid)
            {
                return Error.Validation(
                    "dispatch.invalid_status",
                    $"Shipment {id:D} is not in a dispatchable state.");
            }

            var ready = await trackingEvents.ExistsAsync(
                shipmentId,
                ShipmentTrackingEventTypes.ReadyForDispatch,
                cancellationToken);
            if (!ready)
            {
                return Error.Validation(
                    "dispatch.not_packed",
                    $"Shipment {id:D} must be marked packed before dispatch.");
            }

            shipment.MarkInTransit();
            await shipments.UpdateAsync(shipment, cancellationToken);
            await trackingWriter.RecordOpsStatusTransitionAsync(
                shipment,
                ShipmentStatus.InTransit,
                location: WeYellHubAddress.CityCountry,
                details: courierRef is null
                    ? "Dispatched from WeYell warehouse"
                    : $"Dispatched — courier ref {courierRef}",
                cancellationToken);
            dispatched.Add(id);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsConsolidationDispatchBatchResultDto(
            dispatched.Count,
            dispatched,
            dispatched.Count == 1
                ? "1 shipment dispatched to courier."
                : $"{dispatched.Count} shipments dispatched to courier.");
    }
}
