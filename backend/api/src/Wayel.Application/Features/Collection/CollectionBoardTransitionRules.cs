using Wayel.Domain.Collection;

namespace Wayel.Application.Features.Collection;

public static class CollectionBoardTransitionRules
{
    public static bool CanTransition(string fromColumnId, string toColumnId)
    {
        if (string.Equals(fromColumnId, toColumnId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return (fromColumnId, toColumnId) switch
        {
            (ShipmentCollectionStatuses.InTransit, ShipmentCollectionStatuses.ReadyForCollection) => true,
            (ShipmentCollectionStatuses.ReadyForCollection, ShipmentCollectionStatuses.InTransit) => true,
            (ShipmentCollectionStatuses.ReadyForCollection, ShipmentCollectionStatuses.Collected) => true,
            _ => false,
        };
    }

    public static string? NextColumnId(string columnId) =>
        columnId switch
        {
            ShipmentCollectionStatuses.InTransit => ShipmentCollectionStatuses.ReadyForCollection,
            ShipmentCollectionStatuses.ReadyForCollection => ShipmentCollectionStatuses.Collected,
            _ => null,
        };

    public static string DropBlockedMessage(string fromColumnId, string toColumnId) =>
        toColumnId switch
        {
            ShipmentCollectionStatuses.Collected when fromColumnId == ShipmentCollectionStatuses.InTransit =>
                "Scan in at the hub before collection. Move to Ready for Collection first.",
            ShipmentCollectionStatuses.Collected =>
                "Use Collect and record ID proof to complete handover.",
            _ => "This move is not allowed.",
        };
}
