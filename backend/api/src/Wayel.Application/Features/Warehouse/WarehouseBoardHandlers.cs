using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

public static class WarehouseBoardColumns
{
    public const string Received = "received";
    public const string Stored = "stored";
    public const string ReadyForQuote = "ready_for_quote";
    public const string PreparingDispatch = "preparing_dispatch";
    public const string Picking = "picking";
    public const string Packing = "packing";
    public const string DispatchStaging = "dispatch_staging";
    public const string Dispatched = "dispatched";
}

public sealed record GetOpsWarehouseBoardQuery(
    string? Search = null,
    string? Destination = null,
    string? Service = null,
    int Limit = 120)
    : IQuery<OpsWarehouseBoardDto>;

internal sealed class GetOpsWarehouseBoardQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IParcelOpsPhotoRepository photos,
    IUserRepository users,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks,
    IClock clock) : IQueryHandler<GetOpsWarehouseBoardQuery, OpsWarehouseBoardDto>
{
    private static readonly IReadOnlyList<(string Id, string Label, string Subtitle)> ColumnOrder =
    [
        (WarehouseBoardColumns.Received, "Received", "Just arrived."),
        (WarehouseBoardColumns.Stored, "Stored", "In warehouse."),
        (WarehouseBoardColumns.ReadyForQuote, "Ready for Quote", "Inspection complete."),
        (WarehouseBoardColumns.PreparingDispatch, "Preparing Dispatch", "Paid & shipment created."),
        (WarehouseBoardColumns.Dispatched, "Dispatched", "Handover complete."),
    ];

    public async Task<Result<OpsWarehouseBoardDto>> Handle(
        GetOpsWarehouseBoardQuery request,
        CancellationToken cancellationToken)
    {
        var search = request.Search?.Trim();
        var destination = request.Destination?.Trim();
        var service = request.Service?.Trim();
        var limit = Math.Clamp(request.Limit, 20, 200);
        var now = clock.UtcNow;

        var pickPage = await pickTasks.ListPageAsync(1, limit, null, cancellationToken);
        var packPage = await packingTasks.ListPageAsync(1, limit, null, cancellationToken);

        var pickByShipment = pickPage.Items.ToDictionary(x => x.ShipmentId);
        var packByShipment = packPage.Items.ToDictionary(x => x.ShipmentId);
        var parcelIdsInWorkflow = pickPage.Items
            .SelectMany(x => x.Parcels)
            .Select(x => x.ParcelId)
            .ToHashSet();

        var shipmentCards = new Dictionary<Guid, OpsWarehouseBoardCardDto>();
        var shipmentCoverParcelIds = new Dictionary<Guid, Guid>();
        foreach (var shipmentId in pickByShipment.Keys.Union(packByShipment.Keys))
        {
            pickByShipment.TryGetValue(shipmentId, out var pick);
            packByShipment.TryGetValue(shipmentId, out var pack);
            var column = ResolveShipmentColumn(pick, pack);
            if (column is null)
            {
                continue;
            }

            var coverParcelId = pick?.Parcels.Count > 0 ? pick.Parcels[0].ParcelId : (Guid?)null;
            if (coverParcelId is not null)
            {
                shipmentCoverParcelIds[shipmentId] = coverParcelId.Value;
            }

            var card = BuildShipmentCard(shipmentId, column, pick, pack, now);
            if (!MatchesFilters(card, search, destination, service))
            {
                continue;
            }

            shipmentCards[shipmentId] = card;
        }

        var parcelCards = new List<OpsWarehouseBoardCardDto>();
        var exceptionCards = new List<OpsWarehouseBoardCardDto>();
        var offset = 0;
        const int batchSize = 100;
        var parcelBudget = limit * 2;

        while (parcelCards.Count + exceptionCards.Count < parcelBudget)
        {
            var batch = await parcels.ListRecentPageAsync(offset, batchSize, cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            foreach (var parcel in batch)
            {
                if (parcelIdsInWorkflow.Contains(parcel.Id.Value))
                {
                    continue;
                }

                if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
                {
                    continue;
                }

                var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
                var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
                var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
                var exceptions = OpsExceptionRules.Detect(parcel, invoice, meta);
                var onHold = string.Equals(
                    meta?.WarehouseStatus,
                    ParcelWarehouseStatuses.OnHold,
                    StringComparison.OrdinalIgnoreCase);

                if (onHold || HasHoldException(exceptions))
                {
                    var holdCard = BuildParcelCard(parcel, user, invoice, meta, WarehouseBoardColumns.Received, now, exceptions);
                    holdCard = holdCard with { ColumnId = WarehouseBoardColumns.Received };
                    if (MatchesFilters(holdCard, search, destination, service))
                    {
                        exceptionCards.Add(holdCard with
                        {
                            StatusLabel = onHold ? "On Hold" : exceptions[0].Type.Replace('_', ' '),
                            IssueSummary = onHold ? "Warehouse hold" : exceptions[0].Type.Replace('_', ' '),
                        });
                    }

                    continue;
                }

                var column = ResolveParcelColumn(parcel, invoice, meta);
                var card = BuildParcelCard(parcel, user, invoice, meta, column, now, exceptions);
                if (!MatchesFilters(card, search, destination, service))
                {
                    continue;
                }

                parcelCards.Add(card);
            }

            offset += batch.Count;
            if (batch.Count < batchSize)
            {
                break;
            }
        }

        var coverParcelIds = parcelCards
            .Where(c => c.ParcelId.HasValue)
            .Select(c => c.ParcelId!.Value)
            .Concat(exceptionCards.Where(c => c.ParcelId.HasValue).Select(c => c.ParcelId!.Value))
            .Concat(shipmentCoverParcelIds.Values)
            .Distinct()
            .ToList();
        var coverPhotos = await photos.ListLatestPhotoIdByParcelIdsAsync(coverParcelIds, cancellationToken);

        parcelCards = ApplyCoverPhotos(parcelCards, coverPhotos);
        exceptionCards = ApplyCoverPhotos(exceptionCards, coverPhotos);
        shipmentCards = shipmentCards.ToDictionary(
            x => x.Key,
            x => ApplyCoverPhoto(x.Value, ResolveCoverParcelId(x.Value, shipmentCoverParcelIds), coverPhotos));

        var cardsByColumn = ColumnOrder.ToDictionary(
            x => x.Id,
            _ => new List<OpsWarehouseBoardCardDto>());

        foreach (var card in parcelCards)
        {
            if (cardsByColumn.TryGetValue(card.ColumnId, out var list))
            {
                list.Add(card);
            }
        }

        foreach (var card in shipmentCards.Values)
        {
            if (cardsByColumn.TryGetValue(card.ColumnId, out var list))
            {
                list.Add(card);
            }
        }

        var columns = ColumnOrder
            .Select(c =>
            {
                var cards = cardsByColumn[c.Id]
                    .OrderByDescending(x => x.EventAtUtc ?? DateTime.MinValue)
                    .Take(30)
                    .ToList();
                var overdue = cards.Count(x => x.IsOverdue);
                return new OpsWarehouseBoardColumnDto(c.Id, c.Label, c.Subtitle, cards.Count, overdue, cards);
            })
            .ToList();

        return new OpsWarehouseBoardDto(
            columns,
            exceptionCards
                .OrderByDescending(x => x.EventAtUtc ?? DateTime.MinValue)
                .Take(20)
                .ToList());
    }

    private static bool HasHoldException(IReadOnlyList<OpsExceptionRules.DetectedException> exceptions) =>
        exceptions.Any(x =>
            x.Type is "DAMAGED"
            || (x.Type == "MISSING_INVOICE" && x.Severity == "HIGH"));

    private static string ResolveParcelColumn(Parcel parcel, ParcelInvoice? invoice, ParcelOpsMetadata? meta)
    {
        var warehouseStatus = meta?.WarehouseStatus ?? ParcelWarehouseStatuses.NotStored;
        if (warehouseStatus is ParcelWarehouseStatuses.Dispatched)
        {
            return WarehouseBoardColumns.Dispatched;
        }

        if (parcel.Status == ParcelStatus.ReadyToShip)
        {
            return WarehouseBoardColumns.ReadyForQuote;
        }

        var hasLocation = !string.IsNullOrWhiteSpace(meta?.LocationId)
            || !string.IsNullOrWhiteSpace(meta?.WarehouseLocation);
        if (hasLocation || warehouseStatus is ParcelWarehouseStatuses.Stored)
        {
            return WarehouseBoardColumns.Stored;
        }

        return WarehouseBoardColumns.Received;
    }

    private static string? ResolveShipmentColumn(PickTaskRecord? pick, PackingTaskRecord? pack)
    {
        if (pack?.DispatchStagingStatus == DispatchStagingStatuses.Dispatched)
        {
            return WarehouseBoardColumns.Dispatched;
        }

        if (pick is not null || pack is not null)
        {
            return WarehouseBoardColumns.PreparingDispatch;
        }

        return null;
    }

    private static Guid? ResolveCoverParcelId(
        OpsWarehouseBoardCardDto card,
        Dictionary<Guid, Guid> shipmentCoverParcelIds) =>
        card.ParcelId
            ?? (card.ShipmentId is { } shipmentId && shipmentCoverParcelIds.TryGetValue(shipmentId, out var parcelId)
                ? parcelId
                : null);

    private static List<OpsWarehouseBoardCardDto> ApplyCoverPhotos(
        List<OpsWarehouseBoardCardDto> cards,
        IReadOnlyDictionary<Guid, Guid> coverPhotos) =>
        cards.Select(c => ApplyCoverPhoto(c, c.ParcelId, coverPhotos)).ToList();

    private static OpsWarehouseBoardCardDto ApplyCoverPhoto(
        OpsWarehouseBoardCardDto card,
        Guid? parcelId,
        IReadOnlyDictionary<Guid, Guid> coverPhotos)
    {
        if (parcelId is null || !coverPhotos.TryGetValue(parcelId.Value, out var photoId))
        {
            return card;
        }

        return card with { CoverPhotoId = photoId };
    }

    private static OpsWarehouseBoardCardDto BuildParcelCard(
        Parcel parcel,
        Domain.Users.User? user,
        ParcelInvoice? invoice,
        ParcelOpsMetadata? meta,
        string column,
        DateTime now,
        IReadOnlyList<OpsExceptionRules.DetectedException> exceptions)
    {
        var locationId = meta?.LocationId ?? meta?.WarehouseLocation;
        var suiteMatch = string.IsNullOrWhiteSpace(parcel.SuiteNumber) ? "Unmatched" : null;
        var statusLabel = column switch
        {
            WarehouseBoardColumns.Received => suiteMatch ?? "Received",
            WarehouseBoardColumns.Stored => "Stored",
            WarehouseBoardColumns.ReadyForQuote => "Ready for Quote",
            _ => OpsParcelLabels.Status(parcel.Status),
        };

        return new OpsWarehouseBoardCardDto(
            $"parcel:{parcel.Id.Value}",
            "PARCEL",
            column,
            parcel.Id.Value,
            null,
            null,
            OpsParcelDisplayIds.Format(parcel),
            parcel.ItemName,
            user?.DisplayName,
            statusLabel,
            locationId,
            parcel.SuiteNumber,
            parcel.Retailer,
            user?.DisplayName,
            null,
            null,
            null,
            parcel.WeightKg,
            null,
            null,
            column == WarehouseBoardColumns.Stored ? meta?.UpdatedAtUtc : parcel.ReceivedAtUtc,
            false,
            exceptions.Count > 0 ? exceptions[0].Type : null,
            parcel.TrackingNumber,
            parcel.ReceivedAtUtc,
            column == WarehouseBoardColumns.Stored ? meta?.UpdatedAtUtc : null,
            null,
            null,
            null,
            InvoiceStatusLabel(invoice, parcel),
            InspectionStatusLabel(meta));
    }

    private static OpsWarehouseBoardCardDto BuildShipmentCard(
        Guid shipmentId,
        string column,
        PickTaskRecord? pick,
        PackingTaskRecord? pack,
        DateTime now)
    {
        var displayId = pack?.ShipmentDisplayId ?? WarehouseDisplayIds.Shipment(shipmentId);
        var customer = pack?.CustomerDisplayName ?? pick?.CustomerDisplayName ?? "Customer";
        var parcelCount = pick?.Parcels.Count ?? pack?.PackageCount ?? 1;
        var assignedTo = pick?.AssignedTo ?? pack?.Notes;
        var dueAt = pick?.CreatedAtUtc.AddHours(4);
        var dispatchBy = column == WarehouseBoardColumns.PreparingDispatch && pick is not null
            ? pick.CreatedAtUtc.Date.AddHours(16)
            : (DateTime?)null;
        var isOverdue = dueAt is not null && dueAt < now
            && column is WarehouseBoardColumns.PreparingDispatch;
        var overdueMinutes = isOverdue && dueAt is not null
            ? (int)Math.Max(1, (now - dueAt.Value).TotalMinutes)
            : (int?)null;

        var statusLabel = column switch
        {
            WarehouseBoardColumns.PreparingDispatch => "Paid",
            WarehouseBoardColumns.Dispatched => "Dispatched",
            _ => pick?.Status ?? pack?.Status ?? "Shipment",
        };

        var subtitle = pack is not null
            ? $"{pack.Destination} · {pack.DeliveryMethod}"
            : pick?.SuiteNumber;

        return new OpsWarehouseBoardCardDto(
            $"shipment:{shipmentId}",
            "SHIPMENT",
            column,
            null,
            shipmentId,
            pick?.PickTaskId ?? pack?.PackingTaskId,
            displayId,
            customer,
            subtitle,
            statusLabel,
            null,
            pick?.SuiteNumber,
            null,
            customer,
            pack?.Destination,
            pack?.DeliveryMethod,
            parcelCount,
            pack?.QuotedWeightKg ?? pack?.FinalWeightKg,
            assignedTo,
            dueAt,
            pack?.CompletedAtUtc ?? pick?.CompletedAtUtc ?? pick?.CreatedAtUtc,
            isOverdue,
            null,
            null,
            pick?.CreatedAtUtc,
            pack?.CompletedAtUtc ?? pick?.CompletedAtUtc,
            dispatchBy,
            overdueMinutes,
            null,
            null,
            null);
    }

    private static string InvoiceStatusLabel(ParcelInvoice? invoice, Parcel parcel)
    {
        if (invoice is null)
        {
            return parcel.Status == ParcelStatus.AwaitingInvoice ? "Awaiting Invoice" : "Pending Review";
        }

        return invoice.Status switch
        {
            InvoiceVerificationStatus.Verified => "Verified",
            InvoiceVerificationStatus.Rejected => "Rejected",
            _ => "Pending Review",
        };
    }

    private static string InspectionStatusLabel(ParcelOpsMetadata? meta) =>
        meta?.ConditionStatus switch
        {
            null or "" or "NOT_INSPECTED" => "Not inspected",
            "GOOD" => "Complete",
            "MINOR_DAMAGE" => "Minor damage",
            "MAJOR_DAMAGE" => "Major damage",
            _ => meta.ConditionStatus,
        };

    private static bool MatchesFilters(
        OpsWarehouseBoardCardDto card,
        string? search,
        string? destination,
        string? service)
    {
        if (!string.IsNullOrWhiteSpace(search))
        {
            var haystack = string.Join(
                ' ',
                card.DisplayId,
                card.Title,
                card.Subtitle,
                card.SuiteNumber,
                card.CustomerDisplayName,
                card.LocationId);
            if (!haystack.Contains(search, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        if (!string.IsNullOrWhiteSpace(destination)
            && !(card.Destination ?? string.Empty).Contains(destination, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(service)
            && !(card.DeliveryMethod ?? string.Empty).Contains(service, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return true;
    }
}
