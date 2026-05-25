namespace Wayel.Application.Features.Warehouse;

internal static class WarehouseBoardTransitionRules
{
    private static readonly Dictionary<string, string[]> ParcelTargets = new()
    {
        [WarehouseBoardColumns.Received] = [WarehouseBoardColumns.Stored, WarehouseBoardColumnResolver.ExceptionHold],
        [WarehouseBoardColumns.Stored] =
        [
            WarehouseBoardColumns.Received,
            WarehouseBoardColumns.ReadyForQuote,
            WarehouseBoardColumnResolver.ExceptionHold,
        ],
        [WarehouseBoardColumns.ReadyForQuote] =
        [
            WarehouseBoardColumns.Stored,
            WarehouseBoardColumnResolver.ExceptionHold,
            WarehouseBoardColumns.PreparingDispatch,
        ],
        [WarehouseBoardColumnResolver.ExceptionHold] =
        [
            WarehouseBoardColumns.Received,
            WarehouseBoardColumns.Stored,
        ],
    };

    private static readonly Dictionary<string, string[]> ShipmentTargets = new()
    {
        [WarehouseBoardColumns.PreparingDispatch] = [WarehouseBoardColumns.Dispatched],
    };

    internal static bool IsAllowed(string cardType, string fromColumn, string toColumn) =>
        cardType.Equals("SHIPMENT", StringComparison.OrdinalIgnoreCase)
            ? ShipmentTargets.TryGetValue(fromColumn, out var shipment) && shipment.Contains(toColumn)
            : ParcelTargets.TryGetValue(fromColumn, out var parcel) && parcel.Contains(toColumn);

    internal static IReadOnlyList<string> AllowedTargets(string cardType, string fromColumn) =>
        cardType.Equals("SHIPMENT", StringComparison.OrdinalIgnoreCase)
            ? ShipmentTargets.TryGetValue(fromColumn, out var shipment) ? shipment : []
            : ParcelTargets.TryGetValue(fromColumn, out var parcel) ? parcel : [];
}
