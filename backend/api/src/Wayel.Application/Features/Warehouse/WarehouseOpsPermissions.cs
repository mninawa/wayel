namespace Wayel.Application.Features.Warehouse;

public static class WarehouseOpsPermissions
{
    internal const string Read = "warehouse.read";
    internal const string Write = "warehouse.write";
    internal const string PickingWrite = "picking.write";
    internal const string PackingWrite = "packing.write";
    internal const string DispatchWrite = "dispatch.write";
    internal const string Admin = "warehouse.admin";

    internal static bool CanRead(string role) => role is "lead" or "clerk" or "finance";

    internal static bool CanWrite(string role) => role is "lead" or "clerk";

    internal static bool CanPick(string role) => CanWrite(role);

    internal static bool CanPack(string role) => CanWrite(role);

    internal static bool CanDispatch(string role) => role is "lead" or "clerk";

    internal static bool CanAdmin(string role) => role is "lead";
}
