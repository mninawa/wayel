using Wayel.Application.Features.OpsAuth;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.Parcels;

internal static class OpsPermissions
{
    internal const string Clerk = "clerk";
    internal const string Lead = "lead";
    internal const string Finance = "finance";
    internal const string Receiver = "receiver";
    internal const string Collector = "collector";

    internal const string CollectionRead = "collection.read";
    internal const string CollectionWrite = "collection.write";

    internal static bool HasRegion(string role, IReadOnlyList<string>? regions, string region) =>
        OpsRegions.ResolveForRole(role, regions).Contains(region, StringComparer.Ordinal);

    internal static bool CanIntake(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving)
        && role is Lead or Clerk or Receiver;

    internal static bool CanInspect(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving) && role is Lead or Clerk;

    internal static bool CanVerifyInvoice(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving) && role is Lead or Finance;

    internal static bool CanUploadInvoice(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving) && role is Lead or Clerk;

    internal static bool CanManageExceptions(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving) && role is Lead;

    internal static bool CanSendToQuote(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving) && role is Lead or Finance;

    internal static bool CanManageTeam(string role) =>
        role is Lead;

    internal static bool CanViewInvoice(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Receiving)
        && role is Lead or Finance or Clerk;

    internal static bool CanWriteCollection(string role, IReadOnlyList<string>? regions = null) =>
        HasRegion(role, regions, OpsRegions.Collection) && role is Lead or Clerk or Collector;

    internal static IReadOnlyList<string> CapabilitiesFor(string role, IReadOnlyList<string>? storedRegions = null)
    {
        var regions = OpsRegions.ResolveForRole(role, storedRegions);
        var caps = new HashSet<string>(StringComparer.Ordinal);

        void AddRange(IEnumerable<string> items)
        {
            foreach (var item in items)
            {
                caps.Add(item);
            }
        }

        switch (role.Trim().ToLowerInvariant())
        {
            case Lead:
                AddRange(
                [
                    "intake", "inspect", "invoice.upload", "invoice.verify", "invoice.view",
                    "exceptions.manage", "quote.send", "search", "team.manage",
                    CollectionRead, CollectionWrite,
                    WarehouseOpsPermissions.Read, WarehouseOpsPermissions.Write,
                    WarehouseOpsPermissions.PickingWrite, WarehouseOpsPermissions.PackingWrite,
                    WarehouseOpsPermissions.DispatchWrite, WarehouseOpsPermissions.Admin,
                ]);
                break;
            case Finance:
                AddRange(
                [
                    "invoice.verify", "invoice.view", "quote.send", "search",
                    WarehouseOpsPermissions.Read,
                ]);
                break;
            case Clerk:
                AddRange(
                [
                    "intake", "inspect", "invoice.upload", "invoice.view", "search",
                    CollectionRead, CollectionWrite,
                    WarehouseOpsPermissions.Read, WarehouseOpsPermissions.Write,
                    WarehouseOpsPermissions.PickingWrite, WarehouseOpsPermissions.PackingWrite,
                    WarehouseOpsPermissions.DispatchWrite,
                ]);
                break;
            case Receiver:
                AddRange(["intake", "search"]);
                break;
            case Collector:
                AddRange([CollectionRead, CollectionWrite, "search"]);
                break;
            default:
                AddRange(["search"]);
                break;
        }

        if (!regions.Contains(OpsRegions.Receiving, StringComparer.Ordinal))
        {
            caps.Remove("intake");
            caps.Remove("inspect");
            caps.Remove("invoice.upload");
            caps.Remove("invoice.verify");
            caps.Remove("invoice.view");
            caps.Remove("exceptions.manage");
            caps.Remove("quote.send");
        }

        if (!regions.Contains(OpsRegions.Collection, StringComparer.Ordinal))
        {
            caps.Remove(CollectionRead);
            caps.Remove(CollectionWrite);
        }

        if (!regions.Contains(OpsRegions.Warehouse, StringComparer.Ordinal))
        {
            caps.Remove(WarehouseOpsPermissions.Read);
            caps.Remove(WarehouseOpsPermissions.Write);
            caps.Remove(WarehouseOpsPermissions.PickingWrite);
            caps.Remove(WarehouseOpsPermissions.PackingWrite);
            caps.Remove(WarehouseOpsPermissions.DispatchWrite);
            caps.Remove(WarehouseOpsPermissions.Admin);
        }

        if (!regions.Contains(OpsRegions.Platform, StringComparer.Ordinal))
        {
            caps.Remove("team.manage");
        }

        return caps.ToList();
    }

    internal static Error? Require(bool allowed, string code, string message) =>
        allowed ? null : Error.Forbidden(code, message);
}
