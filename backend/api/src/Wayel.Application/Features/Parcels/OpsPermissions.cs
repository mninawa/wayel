using Wayel.Domain.Common;
using Wayel.Application.Features.Warehouse;

namespace Wayel.Application.Features.Parcels;

internal static class OpsPermissions
{
    internal const string Clerk = "clerk";
    internal const string Lead = "lead";
    internal const string Finance = "finance";

    internal static bool CanIntake(string role) =>
        role is Lead or Clerk;

    internal static bool CanInspect(string role) =>
        role is Lead or Clerk;

    internal static bool CanVerifyInvoice(string role) =>
        role is Lead or Finance;

    internal static bool CanUploadInvoice(string role) =>
        role is Lead or Clerk;

    internal static bool CanManageExceptions(string role) =>
        role is Lead;

    internal static bool CanSendToQuote(string role) =>
        role is Lead or Finance;

    internal static bool CanManageTeam(string role) =>
        role is Lead;

    internal static bool CanViewInvoice(string role) =>
        role is Lead or Finance or Clerk;

    internal static IReadOnlyList<string> CapabilitiesFor(string role) =>
        role switch
        {
            Lead =>
            [
                "intake", "inspect", "invoice.upload", "invoice.verify", "invoice.view",
                "exceptions.manage", "quote.send", "search", "team.manage",
                WarehouseOpsPermissions.Read, WarehouseOpsPermissions.Write,
                WarehouseOpsPermissions.PickingWrite, WarehouseOpsPermissions.PackingWrite,
                WarehouseOpsPermissions.DispatchWrite, WarehouseOpsPermissions.Admin,
            ],
            Finance =>
            [
                "invoice.verify", "invoice.view", "quote.send", "search",
                WarehouseOpsPermissions.Read,
            ],
            Clerk =>
            [
                "intake", "inspect", "invoice.upload", "invoice.view", "search",
                WarehouseOpsPermissions.Read, WarehouseOpsPermissions.Write,
                WarehouseOpsPermissions.PickingWrite, WarehouseOpsPermissions.PackingWrite,
                WarehouseOpsPermissions.DispatchWrite,
            ],
            _ => ["search"],
        };

    internal static Error? Require(bool allowed, string code, string message) =>
        allowed ? null : Error.Forbidden(code, message);
}
