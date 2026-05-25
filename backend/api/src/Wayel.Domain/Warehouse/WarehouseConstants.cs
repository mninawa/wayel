namespace Wayel.Domain.Warehouse;

public static class WarehouseConstants
{
    public const string DefaultWarehouseId = "WH-MID-001";
    public const string DefaultWarehouseName = "Midrand Warehouse";
    public const string ReceivingBayLocationId = "RECEIVING-BAY-01";
    public const string PickingAreaLocationId = "PICKING-AREA-01";
    public const string PackingAreaLocationId = "PACKING-AREA-01";
    public const string DispatchStagingLocationId = "DISPATCH-STAGE-02";

    public const string SuiteZone = "SUITE";
    public const string SuiteStorageType = "Postbox";
    public const int DefaultSuiteCapacity = 25;

    public static string FormatLocationId(string zone, string aisle, string shelf, string bin) =>
        $"{zone}{aisle}-{shelf}-{bin}";

    public static string FormatSuiteLocationId(string suiteNumber) =>
        $"SUITE-{suiteNumber.Trim()}";
}
