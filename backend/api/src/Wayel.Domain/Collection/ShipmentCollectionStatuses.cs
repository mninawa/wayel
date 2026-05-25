namespace Wayel.Domain.Collection;

public static class ShipmentCollectionStatuses
{
    public const string InTransit = "in_transit";
    public const string ReadyForCollection = "ready_for_collection";
    public const string Collected = "collected";
}

public static class CollectionBoardColumns
{
    public const string InTransit = ShipmentCollectionStatuses.InTransit;
    public const string ReadyForCollection = ShipmentCollectionStatuses.ReadyForCollection;
    public const string Collected = ShipmentCollectionStatuses.Collected;
}

public static class CollectorIdDocumentTypes
{
    public const string NationalId = "NationalId";
    public const string Passport = "Passport";
}
