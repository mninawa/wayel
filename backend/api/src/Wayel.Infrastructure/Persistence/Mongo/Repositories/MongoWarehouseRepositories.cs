using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoWarehouseLocationRepository(MongoContext context) : IWarehouseLocationRepository
{
    public async Task<WarehouseLocationPage> ListPageAsync(
        int page,
        int pageSize,
        string? zone = null,
        string? status = null,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        var filter = BuildFilter(zone, status, search);
        var total = (int)await context.WarehouseLocations.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var skip = (Math.Max(1, page) - 1) * Math.Clamp(pageSize, 1, 100);
        var docs = await context.WarehouseLocations
            .Find(filter)
            .SortBy(x => x.Zone)
            .ThenBy(x => x.Aisle)
            .ThenBy(x => x.Shelf)
            .ThenBy(x => x.Bin)
            .Skip(skip)
            .Limit(Math.Clamp(pageSize, 1, 100))
            .ToListAsync(cancellationToken);
        return new WarehouseLocationPage(docs.Select(ToRecord).ToList(), total);
    }

    public async Task<WarehouseLocationRecord?> GetByIdAsync(string locationId, CancellationToken cancellationToken = default)
    {
        var doc = await context.WarehouseLocations
            .Find(x => x.LocationId == locationId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task UpsertAsync(WarehouseLocationRecord location, CancellationToken cancellationToken = default) =>
        context.WarehouseLocations.ReplaceOneAsync(
            x => x.LocationId == location.LocationId,
            FromRecord(location),
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);

    public async Task<bool> TryIncrementOccupancyAsync(string locationId, CancellationToken cancellationToken = default)
    {
        var doc = await context.WarehouseLocations
            .Find(x => x.LocationId == locationId)
            .FirstOrDefaultAsync(cancellationToken);
        if (doc is null || doc.Occupancy >= doc.Capacity)
        {
            return false;
        }

        doc.Occupancy++;
        doc.UpdatedAtUtc = DateTime.UtcNow;
        if (doc.Status is not ("DISABLED" or "HOLD_AREA" or "PACKING_AREA" or "DISPATCH_AREA"))
        {
            doc.Status = doc.Occupancy >= doc.Capacity ? "FULL" : "ACTIVE";
        }

        await context.WarehouseLocations.ReplaceOneAsync(
            x => x.LocationId == locationId,
            doc,
            cancellationToken: cancellationToken);
        return true;
    }

    public async Task<bool> TryDecrementOccupancyAsync(string locationId, CancellationToken cancellationToken = default)
    {
        var doc = await context.WarehouseLocations
            .Find(x => x.LocationId == locationId)
            .FirstOrDefaultAsync(cancellationToken);
        if (doc is null || doc.Occupancy <= 0)
        {
            return false;
        }

        doc.Occupancy--;
        doc.UpdatedAtUtc = DateTime.UtcNow;
        if (doc.Status is not ("DISABLED" or "HOLD_AREA" or "PACKING_AREA" or "DISPATCH_AREA"))
        {
            doc.Status = doc.Occupancy >= doc.Capacity ? "FULL" : "ACTIVE";
        }

        await context.WarehouseLocations.ReplaceOneAsync(
            x => x.LocationId == locationId,
            doc,
            cancellationToken: cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<WarehouseLocationRecord>> ListByWarehouseAsync(
        string warehouseId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.WarehouseLocations
            .Find(x => x.WarehouseId == warehouseId)
            .ToListAsync(cancellationToken);
        return docs.Select(ToRecord).ToList();
    }

    private static FilterDefinition<WarehouseLocationDocument> BuildFilter(string? zone, string? status, string? search)
    {
        var builder = Builders<WarehouseLocationDocument>.Filter;
        var filters = new List<FilterDefinition<WarehouseLocationDocument>> { builder.Empty };
        if (!string.IsNullOrWhiteSpace(zone) && !zone.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            filters.Add(builder.Eq(x => x.Zone, zone.Trim().ToUpperInvariant()));
        }

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            filters.Add(builder.Eq(x => x.Status, status.Trim().ToUpperInvariant()));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            filters.Add(builder.Regex(x => x.LocationId, new MongoDB.Bson.BsonRegularExpression(term, "i")));
        }

        return builder.And(filters);
    }

    private static WarehouseLocationRecord ToRecord(WarehouseLocationDocument d) =>
        new(d.LocationId, d.WarehouseId, d.Zone, d.Aisle, d.Shelf, d.Bin, d.Capacity, d.Occupancy, d.StorageType, d.Status, d.UpdatedAtUtc);

    private static WarehouseLocationDocument FromRecord(WarehouseLocationRecord r) =>
        new()
        {
            LocationId = r.LocationId,
            WarehouseId = r.WarehouseId,
            Zone = r.Zone,
            Aisle = r.Aisle,
            Shelf = r.Shelf,
            Bin = r.Bin,
            Capacity = r.Capacity,
            Occupancy = r.Occupancy,
            StorageType = r.StorageType,
            Status = r.Status,
            UpdatedAtUtc = r.UpdatedAtUtc,
        };
}

internal sealed class MongoWarehouseMovementRepository(MongoContext context) : IWarehouseMovementRepository
{
    public async Task<WarehouseMovementPage> ListPageAsync(
        int page,
        int pageSize,
        Guid? parcelId = null,
        string? movementType = null,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<WarehouseMovementDocument>.Filter;
        var filters = new List<FilterDefinition<WarehouseMovementDocument>> { builder.Empty };
        if (parcelId is { } pid)
        {
            filters.Add(builder.Eq(x => x.ParcelId, pid));
        }

        if (!string.IsNullOrWhiteSpace(movementType) && !movementType.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            filters.Add(builder.Eq(x => x.MovementType, movementType.Trim()));
        }

        if (fromUtc is not null)
        {
            filters.Add(builder.Gte(x => x.MovedAtUtc, fromUtc.Value));
        }

        if (toUtc is not null)
        {
            filters.Add(builder.Lte(x => x.MovedAtUtc, toUtc.Value));
        }

        var filter = builder.And(filters);
        var total = (int)await context.WarehouseMovements.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var skip = (Math.Max(1, page) - 1) * Math.Clamp(pageSize, 1, 100);
        var docs = await context.WarehouseMovements
            .Find(filter)
            .SortByDescending(x => x.MovedAtUtc)
            .Skip(skip)
            .Limit(Math.Clamp(pageSize, 1, 100))
            .ToListAsync(cancellationToken);
        return new WarehouseMovementPage(docs.Select(ToRecord).ToList(), total);
    }

    public Task AddAsync(WarehouseMovementRecord movement, CancellationToken cancellationToken = default) =>
        context.WarehouseMovements.InsertOneAsync(FromRecord(movement), cancellationToken: cancellationToken);

    public async Task<IReadOnlyList<WarehouseMovementRecord>> ListRecentAsync(int limit, CancellationToken cancellationToken = default)
    {
        var docs = await context.WarehouseMovements
            .Find(FilterDefinition<WarehouseMovementDocument>.Empty)
            .SortByDescending(x => x.MovedAtUtc)
            .Limit(Math.Clamp(limit, 1, 50))
            .ToListAsync(cancellationToken);
        return docs.Select(ToRecord).ToList();
    }

    private static WarehouseMovementRecord ToRecord(WarehouseMovementDocument d) =>
        new(d.MovementId, d.ParcelId, d.FromLocationId, d.ToLocationId, d.MovementType, d.MovedBy, d.MovedAtUtc, d.Notes);

    private static WarehouseMovementDocument FromRecord(WarehouseMovementRecord r) =>
        new()
        {
            MovementId = r.MovementId,
            ParcelId = r.ParcelId,
            FromLocationId = r.FromLocationId,
            ToLocationId = r.ToLocationId,
            MovementType = r.MovementType,
            MovedBy = r.MovedBy,
            MovedAtUtc = r.MovedAtUtc,
            Notes = r.Notes,
        };
}

internal sealed class MongoPickTaskRepository(MongoContext context) : IPickTaskRepository
{
    public async Task<PickTaskPage> ListPageAsync(
        int page,
        int pageSize,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        var filter = BuildStatusFilter(status);
        var total = (int)await context.PickTasks.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var skip = (Math.Max(1, page) - 1) * Math.Clamp(pageSize, 1, 100);
        var docs = await context.PickTasks
            .Find(filter)
            .SortByDescending(x => x.CreatedAtUtc)
            .Skip(skip)
            .Limit(Math.Clamp(pageSize, 1, 100))
            .ToListAsync(cancellationToken);
        return new PickTaskPage(docs.Select(ToRecord).ToList(), total);
    }

    public async Task<PickTaskRecord?> GetByIdAsync(Guid pickTaskId, CancellationToken cancellationToken = default)
    {
        var doc = await context.PickTasks.Find(x => x.PickTaskId == pickTaskId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task<PickTaskRecord?> GetByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        var doc = await context.PickTasks.Find(x => x.ShipmentId == shipmentId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task<PickTaskRecord?> FindByParcelIdAsync(Guid parcelId, CancellationToken cancellationToken = default)
    {
        var doc = await context.PickTasks
            .Find(x => x.Parcels.Any(p => p.ParcelId == parcelId))
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(PickTaskRecord task, CancellationToken cancellationToken = default) =>
        context.PickTasks.InsertOneAsync(FromRecord(task), cancellationToken: cancellationToken);

    public Task UpdateAsync(PickTaskRecord task, CancellationToken cancellationToken = default) =>
        context.PickTasks.ReplaceOneAsync(x => x.PickTaskId == task.PickTaskId, FromRecord(task), cancellationToken: cancellationToken);

    public async Task<int> CountByStatusAsync(string status, CancellationToken cancellationToken = default)
    {
        var count = await context.PickTasks.CountDocumentsAsync(
            x => x.Status == status,
            cancellationToken: cancellationToken);
        return (int)count;
    }

    private static FilterDefinition<PickTaskDocument> BuildStatusFilter(string? status)
    {
        if (string.IsNullOrWhiteSpace(status) || status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return FilterDefinition<PickTaskDocument>.Empty;
        }

        return Builders<PickTaskDocument>.Filter.Eq(x => x.Status, status.Trim().ToUpperInvariant());
    }

    private static PickTaskRecord ToRecord(PickTaskDocument d) =>
        new(
            d.PickTaskId,
            d.DisplayId,
            d.ShipmentId,
            d.Status,
            d.AssignedTo,
            d.CustomerDisplayName,
            d.SuiteNumber,
            d.Priority,
            d.Parcels.Select(p => new PickTaskParcelLine(
                p.ParcelId, p.DisplayId, p.ItemName, p.LocationId, p.PickStatus, p.PickedBy, p.PickedAtUtc, p.IssueReason)).ToList(),
            d.CreatedAtUtc,
            d.CompletedAtUtc);

    private static PickTaskDocument FromRecord(PickTaskRecord r) =>
        new()
        {
            PickTaskId = r.PickTaskId,
            DisplayId = r.DisplayId,
            ShipmentId = r.ShipmentId,
            Status = r.Status,
            AssignedTo = r.AssignedTo,
            CustomerDisplayName = r.CustomerDisplayName,
            SuiteNumber = r.SuiteNumber,
            Priority = r.Priority,
            Parcels = r.Parcels.Select(p => new PickTaskParcelLineDocument
            {
                ParcelId = p.ParcelId,
                DisplayId = p.DisplayId,
                ItemName = p.ItemName,
                LocationId = p.LocationId,
                PickStatus = p.PickStatus,
                PickedBy = p.PickedBy,
                PickedAtUtc = p.PickedAtUtc,
                IssueReason = p.IssueReason,
            }).ToList(),
            CreatedAtUtc = r.CreatedAtUtc,
            CompletedAtUtc = r.CompletedAtUtc,
        };
}

internal sealed class MongoPackingTaskRepository(MongoContext context) : IPackingTaskRepository
{
    public async Task<PackingTaskPage> ListPageAsync(
        int page,
        int pageSize,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        var filter = string.IsNullOrWhiteSpace(status) || status.Equals("all", StringComparison.OrdinalIgnoreCase)
            ? FilterDefinition<PackingTaskDocument>.Empty
            : Builders<PackingTaskDocument>.Filter.Eq(x => x.Status, status.Trim().ToUpperInvariant());
        var total = (int)await context.PackingTasks.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var skip = (Math.Max(1, page) - 1) * Math.Clamp(pageSize, 1, 100);
        var docs = await context.PackingTasks
            .Find(filter)
            .SortByDescending(x => x.CreatedAtUtc)
            .Skip(skip)
            .Limit(Math.Clamp(pageSize, 1, 100))
            .ToListAsync(cancellationToken);
        return new PackingTaskPage(docs.Select(ToRecord).ToList(), total);
    }

    public async Task<PackingTaskRecord?> GetByIdAsync(Guid packingTaskId, CancellationToken cancellationToken = default)
    {
        var doc = await context.PackingTasks.Find(x => x.PackingTaskId == packingTaskId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task<PackingTaskRecord?> GetByShipmentIdAsync(Guid shipmentId, CancellationToken cancellationToken = default)
    {
        var doc = await context.PackingTasks.Find(x => x.ShipmentId == shipmentId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(PackingTaskRecord task, CancellationToken cancellationToken = default) =>
        context.PackingTasks.InsertOneAsync(FromRecord(task), cancellationToken: cancellationToken);

    public Task UpdateAsync(PackingTaskRecord task, CancellationToken cancellationToken = default) =>
        context.PackingTasks.ReplaceOneAsync(x => x.PackingTaskId == task.PackingTaskId, FromRecord(task), cancellationToken: cancellationToken);

    public async Task<int> CountByStatusAsync(string status, CancellationToken cancellationToken = default)
    {
        var count = await context.PackingTasks.CountDocumentsAsync(x => x.Status == status, cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task<int> CountByDispatchStatusAsync(string dispatchStatus, CancellationToken cancellationToken = default)
    {
        var count = await context.PackingTasks.CountDocumentsAsync(
            x => x.DispatchStagingStatus == dispatchStatus,
            cancellationToken: cancellationToken);
        return (int)count;
    }

    private static PackingTaskRecord ToRecord(PackingTaskDocument d) =>
        new(
            d.PackingTaskId, d.ShipmentId, d.ShipmentDisplayId, d.Status, d.DispatchStagingStatus,
            d.CustomerDisplayName, d.Destination, d.DeliveryMethod, d.PackageCount,
            d.FinalWeightKg, d.FinalDimensionsLabel, d.PackagingType, d.Sealed,
            d.VolumetricWeightKg, d.ChargeableWeightKg, d.QuotedWeightKg, d.VarianceStatus,
            d.Notes, d.CreatedAtUtc, d.CompletedAtUtc);

    private static PackingTaskDocument FromRecord(PackingTaskRecord r) =>
        new()
        {
            PackingTaskId = r.PackingTaskId,
            ShipmentId = r.ShipmentId,
            ShipmentDisplayId = r.ShipmentDisplayId,
            Status = r.Status,
            DispatchStagingStatus = r.DispatchStagingStatus,
            CustomerDisplayName = r.CustomerDisplayName,
            Destination = r.Destination,
            DeliveryMethod = r.DeliveryMethod,
            PackageCount = r.PackageCount,
            FinalWeightKg = r.FinalWeightKg,
            FinalDimensionsLabel = r.FinalDimensionsLabel,
            PackagingType = r.PackagingType,
            Sealed = r.Sealed,
            VolumetricWeightKg = r.VolumetricWeightKg,
            ChargeableWeightKg = r.ChargeableWeightKg,
            QuotedWeightKg = r.QuotedWeightKg,
            VarianceStatus = r.VarianceStatus,
            Notes = r.Notes,
            CreatedAtUtc = r.CreatedAtUtc,
            CompletedAtUtc = r.CompletedAtUtc,
        };
}

internal sealed class MongoDispatchManifestRepository(MongoContext context) : IDispatchManifestRepository
{
    public async Task<DispatchManifestPage> ListPageAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var total = (int)await context.DispatchManifests.CountDocumentsAsync(FilterDefinition<DispatchManifestDocument>.Empty, cancellationToken: cancellationToken);
        var skip = (Math.Max(1, page) - 1) * Math.Clamp(pageSize, 1, 100);
        var docs = await context.DispatchManifests
            .Find(FilterDefinition<DispatchManifestDocument>.Empty)
            .SortByDescending(x => x.CreatedAtUtc)
            .Skip(skip)
            .Limit(Math.Clamp(pageSize, 1, 100))
            .ToListAsync(cancellationToken);
        return new DispatchManifestPage(docs.Select(ToRecord).ToList(), total);
    }

    public async Task<DispatchManifestRecord?> GetByIdAsync(Guid manifestId, CancellationToken cancellationToken = default)
    {
        var doc = await context.DispatchManifests.Find(x => x.ManifestId == manifestId).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(DispatchManifestRecord manifest, CancellationToken cancellationToken = default) =>
        context.DispatchManifests.InsertOneAsync(FromRecord(manifest), cancellationToken: cancellationToken);

    public Task UpdateAsync(DispatchManifestRecord manifest, CancellationToken cancellationToken = default) =>
        context.DispatchManifests.ReplaceOneAsync(x => x.ManifestId == manifest.ManifestId, FromRecord(manifest), cancellationToken: cancellationToken);

    private static DispatchManifestRecord ToRecord(DispatchManifestDocument d) =>
        new(d.ManifestId, d.DisplayId, d.Courier, d.DispatchDate, d.PickupWindow, d.Status, d.ShipmentIds, d.ProofOfHandover, d.CreatedAtUtc, d.HandedOverAtUtc);

    private static DispatchManifestDocument FromRecord(DispatchManifestRecord r) =>
        new()
        {
            ManifestId = r.ManifestId,
            DisplayId = r.DisplayId,
            Courier = r.Courier,
            DispatchDate = r.DispatchDate,
            PickupWindow = r.PickupWindow,
            Status = r.Status,
            ShipmentIds = r.ShipmentIds.ToList(),
            ProofOfHandover = r.ProofOfHandover,
            CreatedAtUtc = r.CreatedAtUtc,
            HandedOverAtUtc = r.HandedOverAtUtc,
        };
}
