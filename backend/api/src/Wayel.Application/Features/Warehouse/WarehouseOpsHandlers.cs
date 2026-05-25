using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

public sealed record GetOpsWarehouseDashboardQuery : IQuery<OpsWarehouseDashboardDto>;

internal sealed class GetOpsWarehouseDashboardQueryHandler(
    IParcelRepository parcels,
    IParcelOpsMetadataRepository opsMetadata,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IWarehouseLocationRepository locations,
    IWarehouseMovementRepository movements) : IQueryHandler<GetOpsWarehouseDashboardQuery, OpsWarehouseDashboardDto>
{
    public async Task<Result<OpsWarehouseDashboardDto>> Handle(
        GetOpsWarehouseDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var allLocations = await locations.ListByWarehouseAsync(WarehouseConstants.DefaultWarehouseId, cancellationToken);
        var zoneCapacities = allLocations
            .Where(l => l.Status is WarehouseLocationStatuses.Active or WarehouseLocationStatuses.Full)
            .GroupBy(l => l.Zone)
            .Select(g =>
            {
                var cap = g.Sum(x => x.Capacity);
                var occ = g.Sum(x => x.Occupancy);
                return new OpsWarehouseZoneCapacityDto(
                    g.Key,
                    cap,
                    occ,
                    cap > 0 ? (int)Math.Round(occ * 100m / cap) : 0,
                    g.Count());
            })
            .OrderBy(x => x.Zone)
            .ToList();

        var pendingPick = await pickTasks.CountByStatusAsync(PickTaskStatuses.Pending, cancellationToken)
            + await pickTasks.CountByStatusAsync(PickTaskStatuses.InProgress, cancellationToken);
        var pendingPack = await packingTasks.CountByStatusAsync(PackingTaskStatuses.Pending, cancellationToken)
            + await packingTasks.CountByStatusAsync(PackingTaskStatuses.InProgress, cancellationToken);
        var readyDispatch = await packingTasks.CountByDispatchStatusAsync(
            DispatchStagingStatuses.ReadyForDispatch,
            cancellationToken);

        var recent = await movements.ListRecentAsync(8, cancellationToken);
        var activity = new List<OpsWarehouseActivityDto>();
        foreach (var m in recent)
        {
            var parcel = await parcels.GetByIdAsync(new ParcelId(m.ParcelId), cancellationToken);
            activity.Add(new OpsWarehouseActivityDto(
                m.MovementId,
                m.ParcelId,
                parcel is null ? null : OpsParcelDisplayIds.Format(parcel),
                m.MovementType,
                m.ToLocationId,
                m.MovedBy,
                m.MovedAtUtc));
        }

        var pickPage = await pickTasks.ListPageAsync(1, 5, PickTaskStatuses.Pending, cancellationToken);
        var pendingTasks = pickPage.Items.Select(p => new OpsWarehousePendingTaskDto(
            "Picking",
            p.PickTaskId.ToString("D"),
            p.DisplayId,
            p.Status,
            p.Priority,
            p.CustomerDisplayName,
            p.CreatedAtUtc)).ToList();

        return new OpsWarehouseDashboardDto(
            await CountStoredParcelsAsync(cancellationToken),
            pendingPick,
            pendingPack,
            readyDispatch,
            await CountOnHoldAsync(cancellationToken),
            zoneCapacities,
            pendingTasks,
            activity);
    }

    private async Task<int> CountStoredParcelsAsync(CancellationToken cancellationToken)
    {
        var count = 0;
        var offset = 0;
        while (true)
        {
            var batch = await parcels.ListRecentPageAsync(offset, 100, cancellationToken);
            if (batch.Count == 0) break;
            foreach (var p in batch)
            {
                if (p.Status is ParcelStatus.InShipment or ParcelStatus.Delivered) continue;
                var meta = await opsMetadata.GetForParcelAsync(p.Id, cancellationToken);
                if (!string.IsNullOrWhiteSpace(meta?.LocationId) || !string.IsNullOrWhiteSpace(meta?.WarehouseLocation))
                {
                    count++;
                }
            }
            offset += batch.Count;
            if (batch.Count < 100) break;
        }
        return count;
    }

    private async Task<int> CountOnHoldAsync(CancellationToken cancellationToken)
    {
        var count = 0;
        var offset = 0;
        while (true)
        {
            var batch = await parcels.ListRecentPageAsync(offset, 100, cancellationToken);
            if (batch.Count == 0) break;
            foreach (var p in batch)
            {
                var meta = await opsMetadata.GetForParcelAsync(p.Id, cancellationToken);
                if (meta?.WarehouseStatus == ParcelWarehouseStatuses.OnHold) count++;
            }
            offset += batch.Count;
            if (batch.Count < 100) break;
        }
        return count;
    }
}

public sealed record ListOpsWarehouseLocationsQuery(
    int Page = 1,
    int PageSize = 25,
    string? Zone = null,
    string? Status = null,
    string? Search = null) : IQuery<OpsPagedResult<OpsWarehouseLocationDto>>;

internal sealed class ListOpsWarehouseLocationsQueryHandler(IWarehouseLocationRepository locations)
    : IQueryHandler<ListOpsWarehouseLocationsQuery, OpsPagedResult<OpsWarehouseLocationDto>>
{
    public async Task<Result<OpsPagedResult<OpsWarehouseLocationDto>>> Handle(
        ListOpsWarehouseLocationsQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await locations.ListPageAsync(page, pageSize, request.Zone, request.Status, request.Search, cancellationToken);
        return new OpsPagedResult<OpsWarehouseLocationDto>(
            pageResult.Items.Select(WarehouseMappers.ToLocationDto).ToList(),
            pageResult.TotalCount,
            page,
            pageSize);
    }
}

public sealed record CreateOpsWarehouseLocationCommand(
    string Zone,
    string Aisle,
    string Shelf,
    string Bin,
    int Capacity,
    string StorageType,
    string? Status) : ICommand<OpsWarehouseLocationDto>;

internal sealed class CreateOpsWarehouseLocationCommandHandler(
    IWarehouseLocationRepository locations,
    IOpsCallerContext ops,
    IClock clock) : ICommandHandler<CreateOpsWarehouseLocationCommand, OpsWarehouseLocationDto>
{
    public async Task<Result<OpsWarehouseLocationDto>> Handle(
        CreateOpsWarehouseLocationCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanAdmin(ops.Role),
            "warehouse.forbidden",
            "Your role cannot manage warehouse locations.");
        if (denied is not null) return denied;

        var locationId = WarehouseConstants.FormatLocationId(
            request.Zone.Trim().ToUpperInvariant(),
            request.Aisle.Trim().ToUpperInvariant(),
            request.Shelf.Trim(),
            request.Bin.Trim());
        var record = new WarehouseLocationRecord(
            locationId,
            WarehouseConstants.DefaultWarehouseId,
            request.Zone.Trim().ToUpperInvariant(),
            request.Aisle.Trim().ToUpperInvariant(),
            request.Shelf.Trim(),
            request.Bin.Trim(),
            Math.Max(1, request.Capacity),
            0,
            string.IsNullOrWhiteSpace(request.StorageType) ? "Standard" : request.StorageType.Trim(),
            string.IsNullOrWhiteSpace(request.Status) ? WarehouseLocationStatuses.Active : request.Status.Trim().ToUpperInvariant(),
            clock.UtcNow);
        await locations.UpsertAsync(record, cancellationToken);
        return WarehouseMappers.ToLocationDto(record);
    }
}

public sealed record UpdateOpsWarehouseLocationCommand(
    string LocationId,
    int? Capacity,
    string? StorageType,
    string? Status) : ICommand<OpsWarehouseLocationDto>;

internal sealed class UpdateOpsWarehouseLocationCommandHandler(
    IWarehouseLocationRepository locations,
    IOpsCallerContext ops,
    IClock clock) : ICommandHandler<UpdateOpsWarehouseLocationCommand, OpsWarehouseLocationDto>
{
    public async Task<Result<OpsWarehouseLocationDto>> Handle(
        UpdateOpsWarehouseLocationCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanAdmin(ops.Role),
            "warehouse.forbidden",
            "Your role cannot manage warehouse locations.");
        if (denied is not null) return denied;

        var existing = await locations.GetByIdAsync(request.LocationId, cancellationToken);
        if (existing is null)
        {
            return Error.NotFound("location.not_found", "Location not found.");
        }

        var updated = existing with
        {
            Capacity = request.Capacity ?? existing.Capacity,
            StorageType = string.IsNullOrWhiteSpace(request.StorageType) ? existing.StorageType : request.StorageType.Trim(),
            Status = string.IsNullOrWhiteSpace(request.Status) ? existing.Status : request.Status.Trim().ToUpperInvariant(),
            UpdatedAtUtc = clock.UtcNow,
        };
        await locations.UpsertAsync(updated, cancellationToken);
        return WarehouseMappers.ToLocationDto(updated);
    }
}

public sealed record ListOpsWarehouseMovementsQuery(
    int Page = 1,
    int PageSize = 25,
    Guid? ParcelId = null,
    string? MovementType = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null) : IQuery<OpsPagedResult<OpsWarehouseMovementDto>>;

internal sealed class ListOpsWarehouseMovementsQueryHandler(
    IWarehouseMovementRepository movements,
    IParcelRepository parcels) : IQueryHandler<ListOpsWarehouseMovementsQuery, OpsPagedResult<OpsWarehouseMovementDto>>
{
    public async Task<Result<OpsPagedResult<OpsWarehouseMovementDto>>> Handle(
        ListOpsWarehouseMovementsQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var pageResult = await movements.ListPageAsync(
            page, pageSize, request.ParcelId, request.MovementType, request.FromUtc, request.ToUtc, cancellationToken);
        var items = new List<OpsWarehouseMovementDto>();
        foreach (var m in pageResult.Items)
        {
            var parcel = await parcels.GetByIdAsync(new ParcelId(m.ParcelId), cancellationToken);
            items.Add(WarehouseMappers.ToMovementDto(m, parcel));
        }
        return new OpsPagedResult<OpsWarehouseMovementDto>(items, pageResult.TotalCount, page, pageSize);
    }
}

public sealed record CreateOpsWarehouseMovementCommand(
    Guid ParcelId,
    string ToLocationId,
    string MovementType,
    string? Notes) : ICommand<OpsWarehouseMovementDto>;

internal sealed class CreateOpsWarehouseMovementCommandHandler(
    IParcelRepository parcels,
    IParcelOpsMetadataRepository opsMetadata,
    IWarehouseLocationRepository locations,
    IWarehouseMovementRepository movements,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<CreateOpsWarehouseMovementCommand, OpsWarehouseMovementDto>
{
    public async Task<Result<OpsWarehouseMovementDto>> Handle(
        CreateOpsWarehouseMovementCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "warehouse.forbidden",
            "Your role cannot move parcels.");
        if (denied is not null) return denied;

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var toLoc = await locations.GetByIdAsync(request.ToLocationId, cancellationToken);
        if (toLoc is null)
        {
            return Error.NotFound("location.not_found", "Destination location not found.");
        }

        var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
        var from = meta?.LocationId ?? meta?.WarehouseLocation;
        await WarehouseMovementWriter.MoveParcelAsync(
            request.ParcelId,
            from,
            request.ToLocationId.Trim(),
            string.IsNullOrWhiteSpace(request.MovementType) ? WarehouseMovementTypes.Relocate : request.MovementType.Trim(),
            request.Notes,
            ops.Actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);

        var movementPage = await movements.ListPageAsync(1, 1, request.ParcelId, null, null, null, cancellationToken);
        if (movementPage.Items.Count == 0)
        {
            return Error.Validation("movement.failed", "Movement was not recorded.");
        }

        var latest = movementPage.Items[0];
        return WarehouseMappers.ToMovementDto(latest, parcel);
    }
}

public sealed record GetOpsParcelStorageQuery(Guid ParcelId) : IQuery<OpsParcelStorageDto>;

internal sealed class GetOpsParcelStorageQueryHandler(
    IParcelRepository parcels,
    IUserRepository users,
    IParcelOpsMetadataRepository opsMetadata,
    IWarehouseLocationRepository locations,
    IClock clock) : IQueryHandler<GetOpsParcelStorageQuery, OpsParcelStorageDto>
{
    public async Task<Result<OpsParcelStorageDto>> Handle(
        GetOpsParcelStorageQuery request,
        CancellationToken cancellationToken)
    {
        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
        var suiteLocation = await SuiteLocationProvisioner.EnsureAsync(
            parcel.SuiteNumber,
            locations,
            clock,
            cancellationToken);
        var locPage = await locations.ListPageAsync(1, 100, null, WarehouseLocationStatuses.Active, null, cancellationToken);
        var currentId = meta?.LocationId ?? meta?.WarehouseLocation;
        string? currentLabel = null;
        if (!string.IsNullOrWhiteSpace(currentId))
        {
            var loc = await locations.GetByIdAsync(currentId, cancellationToken);
            currentLabel = loc is null
                ? currentId
                : FormatLocationLabel(loc, parcel.SuiteNumber);
        }

        var eligible = locPage.Items
            .Select(WarehouseMappers.ToLocationDto)
            .ToList();
        if (suiteLocation is not null
            && eligible.All(x => !string.Equals(x.LocationId, suiteLocation.LocationId, StringComparison.OrdinalIgnoreCase)))
        {
            eligible.Insert(0, WarehouseMappers.ToLocationDto(suiteLocation));
        }

        eligible = eligible
            .OrderByDescending(x => suiteLocation is not null
                && string.Equals(x.LocationId, suiteLocation.LocationId, StringComparison.OrdinalIgnoreCase))
            .ThenBy(x => x.Zone, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.LocationId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var suggestedId = suiteLocation?.LocationId;
        var suggestedLabel = suiteLocation is null
            ? null
            : SuiteLocationProvisioner.SuitePostboxLabel(parcel.SuiteNumber);

        return new OpsParcelStorageDto(
            parcel.Id.Value,
            OpsParcelDisplayIds.Format(parcel),
            parcel.TrackingNumber,
            user?.DisplayName ?? "Customer",
            parcel.SuiteNumber,
            parcel.ItemName,
            parcel.Status.ToString(),
            currentId,
            currentLabel,
            Math.Max(0, (int)(clock.UtcNow.Date - parcel.ReceivedAtUtc.Date).TotalDays),
            eligible,
            suggestedId,
            suggestedLabel);
    }

    private static string FormatLocationLabel(WarehouseLocationRecord loc, string suiteNumber)
    {
        if (string.Equals(loc.Zone, WarehouseConstants.SuiteZone, StringComparison.OrdinalIgnoreCase))
        {
            return SuiteLocationProvisioner.SuitePostboxLabel(suiteNumber);
        }

        return $"{loc.Zone} · {loc.Aisle} · shelf {loc.Shelf} · bin {loc.Bin}";
    }
}

public sealed record AssignOpsParcelStorageCommand(
    Guid ParcelId,
    string LocationId,
    string? Notes) : ICommand<OpsParcelStorageDto>;

internal sealed class AssignOpsParcelStorageCommandHandler(
    IParcelRepository parcels,
    IParcelOpsMetadataRepository opsMetadata,
    IWarehouseLocationRepository locations,
    IWarehouseMovementRepository movements,
    IUserRepository users,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<AssignOpsParcelStorageCommand, OpsParcelStorageDto>
{
    public async Task<Result<OpsParcelStorageDto>> Handle(
        AssignOpsParcelStorageCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            WarehouseOpsPermissions.CanWrite(ops.Role),
            "warehouse.forbidden",
            "Your role cannot assign storage.");
        if (denied is not null) return denied;

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        if (await locations.GetByIdAsync(request.LocationId, cancellationToken) is null)
        {
            return Error.NotFound("location.not_found", "Location not found.");
        }

        var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
        var from = meta?.LocationId ?? meta?.WarehouseLocation;
        var movementType = string.IsNullOrWhiteSpace(from)
            ? WarehouseMovementTypes.InitialStorage
            : WarehouseMovementTypes.Relocate;

        await WarehouseMovementWriter.MoveParcelAsync(
            request.ParcelId,
            from,
            request.LocationId.Trim(),
            movementType,
            request.Notes,
            ops.Actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);

        return await new GetOpsParcelStorageQueryHandler(parcels, users, opsMetadata, locations, clock)
            .Handle(new GetOpsParcelStorageQuery(request.ParcelId), cancellationToken);
    }
}
