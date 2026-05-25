using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Warehouse;

namespace Wayel.Application.Features.Warehouse;

internal static class WarehouseBoardColumnResolver
{
    internal const string ExceptionHold = "exception_hold";

    internal static string ResolveParcelColumn(Parcel parcel, ParcelInvoice? invoice, ParcelOpsMetadata? meta)
    {
        if (IsOnHold(parcel, invoice, meta))
        {
            return ExceptionHold;
        }

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

    internal static string? ResolveShipmentColumn(PickTaskRecord? pick, PackingTaskRecord? pack)
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

    internal static bool IsOnHold(Parcel parcel, ParcelInvoice? invoice, ParcelOpsMetadata? meta)
    {
        if (string.Equals(meta?.WarehouseStatus, ParcelWarehouseStatuses.OnHold, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var exceptions = OpsExceptionRules.Detect(parcel, invoice, meta);
        return exceptions.Any(x =>
            x.Type is "DAMAGED"
            || (x.Type == "MISSING_INVOICE" && x.Severity == "HIGH"));
    }
}
