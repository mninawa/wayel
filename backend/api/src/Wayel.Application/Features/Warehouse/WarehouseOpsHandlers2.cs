using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Collection;
using Wayel.Application.Features.Parcels;
using Wayel.Application.Features.Tracking;
using Wayel.Domain.Common;
using Wayel.Domain.Shipments;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

public sealed record ListOpsPickTasksQuery(int Page = 1, int PageSize = 25, string? Status = null)
    : IQuery<OpsPagedResult<OpsPickTaskDto>>;

internal sealed class ListOpsPickTasksQueryHandler(IPickTaskRepository pickTasks)
    : IQueryHandler<ListOpsPickTasksQuery, OpsPagedResult<OpsPickTaskDto>>
{
    public async Task<Result<OpsPagedResult<OpsPickTaskDto>>> Handle(
        ListOpsPickTasksQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await pickTasks.ListPageAsync(page, pageSize, request.Status, cancellationToken);
        return new OpsPagedResult<OpsPickTaskDto>(
            pageResult.Items.Select(WarehouseMappers.ToPickTaskDto).ToList(),
            pageResult.TotalCount,
            page,
            pageSize);
    }
}

public sealed record GetOpsPickTaskQuery(Guid PickTaskId) : IQuery<OpsPickTaskDto>;

internal sealed class GetOpsPickTaskQueryHandler(IPickTaskRepository pickTasks)
    : IQueryHandler<GetOpsPickTaskQuery, OpsPickTaskDto>
{
    public async Task<Result<OpsPickTaskDto>> Handle(GetOpsPickTaskQuery request, CancellationToken cancellationToken)
    {
        var task = await pickTasks.GetByIdAsync(request.PickTaskId, cancellationToken);
        return task is null
            ? Error.NotFound("pick_task.not_found", "Pick task not found.")
            : WarehouseMappers.ToPickTaskDto(task);
    }
}

public sealed record MarkOpsPickTaskParcelPickedCommand(
    Guid PickTaskId,
    Guid ParcelId,
    string? IssueReason) : ICommand<OpsPickTaskDto>;

internal sealed class MarkOpsPickTaskParcelPickedCommandHandler(
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<MarkOpsPickTaskParcelPickedCommand, OpsPickTaskDto>
{
    public async Task<Result<OpsPickTaskDto>> Handle(
        MarkOpsPickTaskParcelPickedCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanPick(ops.Role),
            "warehouse.forbidden",
            "Your role cannot complete picking.");
        if (denied is not null) return denied;

        var task = await pickTasks.GetByIdAsync(request.PickTaskId, cancellationToken);
        if (task is null)
        {
            return Error.NotFound("pick_task.not_found", "Pick task not found.");
        }

        var now = clock.UtcNow;
        var updatedLines = task.Parcels.Select(p =>
            p.ParcelId == request.ParcelId
                ? p with
                {
                    PickStatus = PickParcelStatuses.Picked,
                    PickedBy = ops.Actor,
                    PickedAtUtc = now,
                    IssueReason = request.IssueReason,
                }
                : p).ToList();

        var allPicked = updatedLines.All(p => p.PickStatus == PickParcelStatuses.Picked);
        var status = allPicked
            ? PickTaskStatuses.Picked
            : updatedLines.Any(p => p.PickStatus == PickParcelStatuses.Picked)
                ? PickTaskStatuses.PartiallyPicked
                : PickTaskStatuses.InProgress;

        var updated = task with
        {
            Parcels = updatedLines,
            Status = status,
            AssignedTo = ops.Actor,
            CompletedAtUtc = allPicked ? now : task.CompletedAtUtc,
        };
        await pickTasks.UpdateAsync(updated, cancellationToken);

        if (allPicked)
        {
            var packing = await packingTasks.GetByShipmentIdAsync(task.ShipmentId, cancellationToken);
            if (packing is not null && packing.Status == PackingTaskStatuses.Pending)
            {
                await packingTasks.UpdateAsync(
                    packing with { Status = PackingTaskStatuses.InProgress },
                    cancellationToken);
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return WarehouseMappers.ToPickTaskDto(updated);
    }
}

public sealed record ListOpsPackingTasksQuery(int Page = 1, int PageSize = 25, string? Status = null)
    : IQuery<OpsPagedResult<OpsPackingTaskDto>>;

internal sealed class ListOpsPackingTasksQueryHandler(IPackingTaskRepository packingTasks)
    : IQueryHandler<ListOpsPackingTasksQuery, OpsPagedResult<OpsPackingTaskDto>>
{
    public async Task<Result<OpsPagedResult<OpsPackingTaskDto>>> Handle(
        ListOpsPackingTasksQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await packingTasks.ListPageAsync(page, pageSize, request.Status, cancellationToken);
        return new OpsPagedResult<OpsPackingTaskDto>(
            pageResult.Items.Select(WarehouseMappers.ToPackingTaskDto).ToList(),
            pageResult.TotalCount,
            page,
            pageSize);
    }
}

public sealed record GetOpsPackingTaskQuery(Guid PackingTaskId) : IQuery<OpsPackingTaskDto>;

internal sealed class GetOpsPackingTaskQueryHandler(IPackingTaskRepository packingTasks)
    : IQueryHandler<GetOpsPackingTaskQuery, OpsPackingTaskDto>
{
    public async Task<Result<OpsPackingTaskDto>> Handle(GetOpsPackingTaskQuery request, CancellationToken cancellationToken)
    {
        var task = await packingTasks.GetByIdAsync(request.PackingTaskId, cancellationToken);
        return task is null
            ? Error.NotFound("packing_task.not_found", "Packing task not found.")
            : WarehouseMappers.ToPackingTaskDto(task);
    }
}

public sealed record CompleteOpsPackingTaskCommand(
    Guid PackingTaskId,
    decimal FinalWeightKg,
    string FinalDimensionsLabel,
    string PackagingType,
    int PackageCount,
    string? Notes) : ICommand<OpsPackingTaskDto>;

internal sealed class CompleteOpsPackingTaskCommandHandler(
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<CompleteOpsPackingTaskCommand, OpsPackingTaskDto>
{
    public async Task<Result<OpsPackingTaskDto>> Handle(
        CompleteOpsPackingTaskCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanPack(ops.Role),
            "warehouse.forbidden",
            "Your role cannot complete packing.");
        if (denied is not null) return denied;

        var packing = await packingTasks.GetByIdAsync(request.PackingTaskId, cancellationToken);
        if (packing is null)
        {
            return Error.NotFound("packing_task.not_found", "Packing task not found.");
        }

        var pick = await pickTasks.GetByShipmentIdAsync(packing.ShipmentId, cancellationToken);
        if (pick is null || pick.Status != PickTaskStatuses.Picked)
        {
            return Error.Validation("packing.parcels_not_picked", "All parcels must be picked before packing can be completed.");
        }

        var volumetric = WarehouseWeightCalculator.VolumetricKg(request.FinalDimensionsLabel);
        var chargeable = WarehouseWeightCalculator.ChargeableKg(request.FinalWeightKg, volumetric);
        var variance = WarehouseWeightCalculator.VarianceStatus(chargeable, packing.QuotedWeightKg);
        var now = clock.UtcNow;

        var updated = packing with
        {
            Status = variance == "REVIEW" ? PackingTaskStatuses.VarianceReview : PackingTaskStatuses.Packed,
            DispatchStagingStatus = variance == "REVIEW"
                ? DispatchStagingStatuses.Blocked
                : DispatchStagingStatuses.ReadyForDispatch,
            FinalWeightKg = request.FinalWeightKg,
            FinalDimensionsLabel = request.FinalDimensionsLabel.Trim(),
            PackagingType = request.PackagingType.Trim(),
            PackageCount = Math.Max(1, request.PackageCount),
            Sealed = true,
            VolumetricWeightKg = volumetric,
            ChargeableWeightKg = chargeable,
            VarianceStatus = variance,
            Notes = request.Notes,
            CompletedAtUtc = now,
        };
        await packingTasks.UpdateAsync(updated, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return WarehouseMappers.ToPackingTaskDto(updated);
    }
}

public sealed record ListOpsDispatchStagingQuery(int Page = 1, int PageSize = 25, string? Status = null)
    : IQuery<OpsPagedResult<OpsDispatchStagingItemDto>>;

internal sealed class ListOpsDispatchStagingQueryHandler(
    IPackingTaskRepository packingTasks,
    IPickTaskRepository pickTasks,
    IShipmentRepository shipments) : IQueryHandler<ListOpsDispatchStagingQuery, OpsPagedResult<OpsDispatchStagingItemDto>>
{
    public async Task<Result<OpsPagedResult<OpsDispatchStagingItemDto>>> Handle(
        ListOpsDispatchStagingQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await packingTasks.ListPageAsync(page, pageSize, null, cancellationToken);
        var items = new List<OpsDispatchStagingItemDto>();
        foreach (var p in pageResult.Items)
        {
            if (p.Status is not (PackingTaskStatuses.Packed or PackingTaskStatuses.VarianceReview))
            {
                continue;
            }

            if (!string.IsNullOrWhiteSpace(request.Status)
                && !request.Status.Equals("all", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(p.DispatchStagingStatus, request.Status, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var pick = await pickTasks.GetByShipmentIdAsync(p.ShipmentId, cancellationToken);
            var shipment = await shipments.GetByIdAsync(new ShipmentId(p.ShipmentId), cancellationToken);
            items.Add(new OpsDispatchStagingItemDto(
                p.ShipmentId,
                p.ShipmentDisplayId,
                p.CustomerDisplayName,
                pick?.SuiteNumber ?? "—",
                p.DeliveryMethod,
                p.DispatchStagingStatus,
                pick?.Parcels.Count ?? 0,
                p.ChargeableWeightKg ?? p.FinalWeightKg ?? 0,
                p.CompletedAtUtc));
        }

        return new OpsPagedResult<OpsDispatchStagingItemDto>(items, items.Count, page, pageSize);
    }
}

public sealed record GetOpsDispatchManifestDetailQuery(Guid ManifestId)
    : IQuery<OpsDispatchManifestDetailDto>;

internal sealed class GetOpsDispatchManifestDetailQueryHandler(
    IDispatchManifestRepository manifests,
    IPackingTaskRepository packingTasks,
    IPickTaskRepository pickTasks)
    : IQueryHandler<GetOpsDispatchManifestDetailQuery, OpsDispatchManifestDetailDto>
{
    public async Task<Result<OpsDispatchManifestDetailDto>> Handle(
        GetOpsDispatchManifestDetailQuery request,
        CancellationToken cancellationToken)
    {
        var manifest = await manifests.GetByIdAsync(request.ManifestId, cancellationToken);
        if (manifest is null)
        {
            return Error.NotFound("manifest.not_found", "Dispatch manifest not found.");
        }

        var shipments = new List<OpsDispatchManifestShipmentRowDto>();
        var labelPrintedByDefault = !string.Equals(manifest.Status, ManifestStatuses.Draft, StringComparison.OrdinalIgnoreCase);

        foreach (var shipmentId in manifest.ShipmentIds)
        {
            var packing = await packingTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
            var pick = await pickTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);

            var customer = packing?.CustomerDisplayName ?? pick?.CustomerDisplayName ?? "—";
            var destination = packing?.Destination
                ?? (pick is null ? "—" : $"Suite {pick.SuiteNumber}");
            var packages = packing?.PackageCount ?? pick?.Parcels.Count ?? 1;
            var weight = packing?.ChargeableWeightKg ?? packing?.FinalWeightKg ?? 0m;
            var labelStatus = labelPrintedByDefault ? "Printed" : "Pending";

            shipments.Add(new OpsDispatchManifestShipmentRowDto(
                shipmentId,
                packing?.ShipmentDisplayId ?? pick?.DisplayId ?? shipmentId.ToString("N")[..6].ToUpperInvariant(),
                customer,
                destination,
                packages,
                weight,
                labelStatus));
        }

        var totalPackages = shipments.Sum(s => s.Packages);
        var totalWeight = shipments.Sum(s => s.WeightKg);
        var status = manifest.Status.ToUpperInvariant();
        var checks = new List<OpsDispatchManifestHandoverCheckDto>
        {
            new("Labels printed", labelPrintedByDefault),
            new(
                "Customs docs attached",
                status is "READY" or "PRINTED" or "HANDED_OVER"),
            new(
                "Handover proof confirmed",
                status == "HANDED_OVER" && !string.IsNullOrWhiteSpace(manifest.ProofOfHandover)),
        };

        var manifestDto = new OpsDispatchManifestDto(
            manifest.ManifestId,
            manifest.DisplayId,
            manifest.Courier,
            manifest.DispatchDate,
            manifest.PickupWindow,
            manifest.Status,
            manifest.ShipmentIds,
            manifest.ShipmentIds.Count,
            manifest.ProofOfHandover,
            manifest.CreatedAtUtc,
            manifest.HandedOverAtUtc);

        return new OpsDispatchManifestDetailDto(
            manifestDto,
            totalWeight,
            totalPackages,
            shipments,
            checks);
    }
}

public sealed record ListOpsDispatchManifestsQuery(int Page = 1, int PageSize = 25)
    : IQuery<OpsPagedResult<OpsDispatchManifestDto>>;

internal sealed class ListOpsDispatchManifestsQueryHandler(IDispatchManifestRepository manifests)
    : IQueryHandler<ListOpsDispatchManifestsQuery, OpsPagedResult<OpsDispatchManifestDto>>
{
    public async Task<Result<OpsPagedResult<OpsDispatchManifestDto>>> Handle(
        ListOpsDispatchManifestsQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await manifests.ListPageAsync(page, pageSize, cancellationToken);
        return new OpsPagedResult<OpsDispatchManifestDto>(
            pageResult.Items.Select(m => new OpsDispatchManifestDto(
                m.ManifestId, m.DisplayId, m.Courier, m.DispatchDate, m.PickupWindow, m.Status,
                m.ShipmentIds, m.ShipmentIds.Count, m.ProofOfHandover, m.CreatedAtUtc, m.HandedOverAtUtc)).ToList(),
            pageResult.TotalCount,
            page,
            pageSize);
    }
}

public sealed record CreateOpsDispatchManifestCommand(
    string Courier,
    DateTime DispatchDate,
    string? PickupWindow,
    IReadOnlyList<Guid> ShipmentIds) : ICommand<OpsDispatchManifestDto>;

internal sealed class CreateOpsDispatchManifestCommandHandler(
    IDispatchManifestRepository manifests,
    IPackingTaskRepository packingTasks,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<CreateOpsDispatchManifestCommand, OpsDispatchManifestDto>
{
    public async Task<Result<OpsDispatchManifestDto>> Handle(
        CreateOpsDispatchManifestCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanDispatch(ops.Role),
            "warehouse.forbidden",
            "Your role cannot create manifests.");
        if (denied is not null) return denied;

        if (request.ShipmentIds.Count == 0)
        {
            return Error.Validation("manifest.empty", "Select at least one shipment.");
        }

        var manifestId = Guid.NewGuid();
        var record = new DispatchManifestRecord(
            manifestId,
            WarehouseDisplayIds.Manifest(manifestId),
            string.IsNullOrWhiteSpace(request.Courier) ? "PUDO" : request.Courier.Trim(),
            request.DispatchDate,
            request.PickupWindow,
            ManifestStatuses.Draft,
            request.ShipmentIds.Distinct().ToList(),
            null,
            clock.UtcNow,
            null);
        await manifests.AddAsync(record, cancellationToken);

        foreach (var shipmentId in request.ShipmentIds)
        {
            var packing = await packingTasks.GetByShipmentIdAsync(shipmentId, cancellationToken);
            if (packing is not null)
            {
                await packingTasks.UpdateAsync(
                    packing with { DispatchStagingStatus = DispatchStagingStatuses.InManifest },
                    cancellationToken);
            }
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return new OpsDispatchManifestDto(
            record.ManifestId, record.DisplayId, record.Courier, record.DispatchDate, record.PickupWindow,
            record.Status, record.ShipmentIds, record.ShipmentIds.Count, record.ProofOfHandover,
            record.CreatedAtUtc, record.HandedOverAtUtc);
    }
}

public sealed record ConfirmOpsManifestHandoverCommand(Guid ManifestId, string? ProofOfHandover)
    : ICommand<OpsDispatchManifestDto>;

internal sealed class ConfirmOpsManifestHandoverCommandHandler(
    IDispatchManifestRepository manifests,
    IShipmentRepository shipments,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ConfirmOpsManifestHandoverCommand, OpsDispatchManifestDto>
{
    public async Task<Result<OpsDispatchManifestDto>> Handle(
        ConfirmOpsManifestHandoverCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanDispatch(ops.Role),
            "warehouse.forbidden",
            "Your role cannot confirm handover.");
        if (denied is not null) return denied;

        var manifest = await manifests.GetByIdAsync(request.ManifestId, cancellationToken);
        if (manifest is null)
        {
            return Error.NotFound("manifest.not_found", "Manifest not found.");
        }

        foreach (var shipmentId in manifest.ShipmentIds)
        {
            var shipment = await shipments.GetByIdAsync(new ShipmentId(shipmentId), cancellationToken);
            if (shipment is null) continue;
            shipment.MarkInTransit();
            await shipments.UpdateAsync(shipment, cancellationToken);
            await trackingEvents.RecordOpsStatusTransitionAsync(
                shipment,
                ShipmentStatus.InTransit,
                "Midrand, South Africa",
                $"Manifest {manifest.DisplayId} handed to {manifest.Courier}",
                cancellationToken);
        }

        var updated = manifest with
        {
            Status = ManifestStatuses.HandedOver,
            ProofOfHandover = request.ProofOfHandover,
            HandedOverAtUtc = clock.UtcNow,
        };
        await manifests.UpdateAsync(updated, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new OpsDispatchManifestDto(
            updated.ManifestId, updated.DisplayId, updated.Courier, updated.DispatchDate, updated.PickupWindow,
            updated.Status, updated.ShipmentIds, updated.ShipmentIds.Count, updated.ProofOfHandover,
            updated.CreatedAtUtc, updated.HandedOverAtUtc);
    }
}

public sealed record DispatchOpsShipmentCommand(Guid ShipmentId) : ICommand<WarehouseActionResultDto>;

internal sealed class DispatchOpsShipmentCommandHandler(
    IShipmentRepository shipments,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IPickupBranchRepository pickupBranches,
    IShipmentCollectionRepository collections,
    ShipmentTrackingEventWriter trackingEvents,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<DispatchOpsShipmentCommand, WarehouseActionResultDto>
{
    public async Task<Result<WarehouseActionResultDto>> Handle(
        DispatchOpsShipmentCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanDispatch(ops.Role),
            "warehouse.forbidden",
            "Your role cannot dispatch shipments.");
        if (denied is not null) return denied;

        var shipment = await shipments.GetByIdAsync(new ShipmentId(request.ShipmentId), cancellationToken);
        if (shipment is null)
        {
            return Error.NotFound("shipment.not_found", "Shipment not found.");
        }

        var packing = await packingTasks.GetByShipmentIdAsync(request.ShipmentId, cancellationToken);
        if (packing is null || packing.DispatchStagingStatus != DispatchStagingStatuses.ReadyForDispatch)
        {
            return Error.Validation("dispatch.not_ready", "Shipment is not ready for dispatch.");
        }

        shipment.MarkInTransit();
        await shipments.UpdateAsync(shipment, cancellationToken);
        await trackingEvents.RecordOpsStatusTransitionAsync(
            shipment,
            ShipmentStatus.InTransit,
            "Midrand, South Africa",
            "Dispatched from WeYell warehouse",
            cancellationToken);
        await packingTasks.UpdateAsync(
            packing with { DispatchStagingStatus = DispatchStagingStatuses.Dispatched },
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        await ShipmentCollectionProvisioner.EnsureInTransitAsync(
            request.ShipmentId,
            shipments,
            pickTasks,
            packingTasks,
            users,
            addresses,
            pickupBranches,
            collections,
            clock,
            cancellationToken);

        return new WarehouseActionResultDto("Shipment dispatched to courier.");
    }
}
