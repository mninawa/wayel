using Wayel.Application.Abstractions.Security;

namespace Wayel.Api.Infrastructure;

internal sealed class OpsCallerContext(IHttpContextAccessor httpContextAccessor) : IOpsCallerContext
{
    public bool IsOps =>
        httpContextAccessor.HttpContext?.Items.ContainsKey(OpsHttpContextKeys.Role) == true;

    public string Role =>
        httpContextAccessor.HttpContext?.Items[OpsHttpContextKeys.Role] as string ?? string.Empty;

    public string Actor =>
        httpContextAccessor.HttpContext?.Items[OpsHttpContextKeys.Actor] as string ?? "Ops User";

    public IReadOnlyList<string> Regions =>
        httpContextAccessor.HttpContext?.Items[OpsHttpContextKeys.Regions] as IReadOnlyList<string>
        ?? [];
}

internal static class OpsHttpContextKeys
{
    public const string Role = "OpsRole";
    public const string Actor = "OpsActor";
    public const string Regions = "OpsRegions";
}
