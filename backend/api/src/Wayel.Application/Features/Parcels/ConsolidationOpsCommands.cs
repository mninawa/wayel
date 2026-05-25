using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Parcels;

public sealed record ListOpsConsolidationInventoryQuery(
    int Page = 1,
    int PageSize = OpsListPagination.DefaultPageSize,
    string? SuiteNumber = null,
    string? Location = null)
    : IQuery<OpsPagedResult<OpsConsolidationInventoryItemDto>>;

internal sealed class ListOpsConsolidationInventoryQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IUserRepository users,
    IClock clock) : IQueryHandler<ListOpsConsolidationInventoryQuery, OpsPagedResult<OpsConsolidationInventoryItemDto>>
{
    public async Task<Result<OpsPagedResult<OpsConsolidationInventoryItemDto>>> Handle(
        ListOpsConsolidationInventoryQuery request,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = OpsListPagination.Normalize(request.Page, request.PageSize);
        var suiteFilter = request.SuiteNumber?.Trim();
        var locationFilter = request.Location?.Trim();
        var all = await BuildInventoryAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(suiteFilter))
        {
            all = all
                .Where(x => x.SuiteNumber.Contains(suiteFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(locationFilter))
        {
            all = all
                .Where(x =>
                    (x.WarehouseLocation ?? string.Empty)
                        .Contains(locationFilter, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var slice = all
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new OpsPagedResult<OpsConsolidationInventoryItemDto>(slice, all.Count, page, pageSize);
    }

    private async Task<List<OpsConsolidationInventoryItemDto>> BuildInventoryAsync(
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var result = new List<OpsConsolidationInventoryItemDto>();
        const int batchSize = 100;
        var offset = 0;

        while (true)
        {
            var batch = await parcels.ListRecentPageAsync(offset, batchSize, cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            foreach (var parcel in batch)
            {
                if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
                {
                    continue;
                }

                var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
                var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
                var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
                var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
                var days = Math.Max(0, (int)(now.Date - parcel.ReceivedAtUtc.Date).TotalDays);

                result.Add(new OpsConsolidationInventoryItemDto(
                    parcel.Id.Value,
                    OpsParcelDisplayIds.Format(parcel),
                    parcel.TrackingNumber,
                    user?.DisplayName ?? "Customer",
                    parcel.SuiteNumber,
                    parcel.Retailer,
                    parcel.ItemName,
                    parcel.Status.ToString(),
                    meta?.LocationId ?? meta?.WarehouseLocation,
                    days,
                    parcel.WeightKg,
                    readiness.State,
                    parcel.ReceivedAtUtc));
            }

            offset += batch.Count;
            if (batch.Count < batchSize)
            {
                break;
            }
        }

        return result
            .OrderBy(x => x.SuiteNumber, StringComparer.OrdinalIgnoreCase)
            .ThenByDescending(x => x.ReceivedAtUtc)
            .ToList();
    }
}

public sealed record UpdateOpsParcelStorageLocationCommand(
    Guid ParcelId,
    string? WarehouseLocation) : ICommand<UpdateOpsParcelStorageLocationResultDto>;

internal sealed class UpdateOpsParcelStorageLocationCommandHandler(
    IParcelRepository parcels,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsActivityRepository activities,
    IWarehouseLocationRepository locations,
    IWarehouseMovementRepository movements,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<UpdateOpsParcelStorageLocationCommand, UpdateOpsParcelStorageLocationResultDto>
{
    public async Task<Result<UpdateOpsParcelStorageLocationResultDto>> Handle(
        UpdateOpsParcelStorageLocationCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanInspect(ops.Role),
            "ops.consolidation.forbidden",
            "Your role cannot assign storage locations.");
        if (denied is not null)
        {
            return denied;
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
        {
            return Error.Validation(
                "consolidation.parcel_left_warehouse",
                "Cannot assign storage for a parcel that has left the warehouse.");
        }

        var raw = string.IsNullOrWhiteSpace(request.WarehouseLocation)
            ? null
            : request.WarehouseLocation.Trim();

        if (raw is null)
        {
            return Error.Validation("location.required", "Storage location is required.");
        }

        var locationId = await ResolveLocationIdAsync(raw, parcel.SuiteNumber, locations, clock, cancellationToken);
        if (locationId is null)
        {
            return Error.NotFound("location.not_found", "Storage location not found.");
        }

        var existing = await opsMetadata.GetForParcelAsync(parcelId, cancellationToken);
        var from = existing?.LocationId ?? existing?.WarehouseLocation;
        var movementType = string.IsNullOrWhiteSpace(from)
            ? WarehouseMovementTypes.InitialStorage
            : WarehouseMovementTypes.Relocate;

        await WarehouseMovementWriter.MoveParcelAsync(
            parcel.Id.Value,
            from,
            locationId,
            movementType,
            "Updated from consolidation inventory",
            ops.Actor,
            parcels,
            opsMetadata,
            locations,
            movements,
            clock,
            unitOfWork,
            cancellationToken);

        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "STORAGE_ASSIGNED",
            "Storage location updated",
            locationId,
            ops.Actor,
            clock.UtcNow,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var label = locationId.StartsWith("SUITE-", StringComparison.OrdinalIgnoreCase)
            ? SuiteLocationProvisioner.SuitePostboxLabel(parcel.SuiteNumber)
            : locationId;

        return new UpdateOpsParcelStorageLocationResultDto(
            parcelId.Value,
            locationId,
            $"Parcel stored at {label}.");
    }

    private static async Task<string?> ResolveLocationIdAsync(
        string raw,
        string suiteNumber,
        IWarehouseLocationRepository locations,
        IClock clock,
        CancellationToken cancellationToken)
    {
        if (await locations.GetByIdAsync(raw, cancellationToken) is not null)
        {
            return raw;
        }

        if (raw.StartsWith("SUITE-", StringComparison.OrdinalIgnoreCase))
        {
            var suiteFromId = raw["SUITE-".Length..];
            var ensured = await SuiteLocationProvisioner.EnsureAsync(suiteFromId, locations, clock, cancellationToken);
            return ensured?.LocationId;
        }

        if (raw.All(char.IsDigit))
        {
            var ensured = await SuiteLocationProvisioner.EnsureAsync(raw, locations, clock, cancellationToken);
            return ensured?.LocationId;
        }

        if (!string.IsNullOrWhiteSpace(suiteNumber)
            && string.Equals(raw, suiteNumber, StringComparison.OrdinalIgnoreCase))
        {
            var ensured = await SuiteLocationProvisioner.EnsureAsync(suiteNumber, locations, clock, cancellationToken);
            return ensured?.LocationId;
        }

        return null;
    }
}
