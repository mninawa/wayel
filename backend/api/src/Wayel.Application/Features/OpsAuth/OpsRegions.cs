namespace Wayel.Application.Features.OpsAuth;

/// <summary>
/// Functional areas of the ops console. Assigned per user on invite; drives
/// navigation visibility and API authorization.
/// </summary>
public static class OpsRegions
{
    public const string Receiving = "receiving";
    public const string Collection = "collection";
    public const string Warehouse = "warehouse";
    public const string Platform = "platform";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Receiving,
            Collection,
            Warehouse,
            Platform,
        };

    public static IReadOnlyList<string> Normalize(IEnumerable<string>? values)
    {
        if (values is null)
        {
            return [];
        }

        var list = new List<string>();
        foreach (var raw in values)
        {
            var v = raw?.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(v) || !All.Contains(v) || list.Contains(v, StringComparer.Ordinal))
            {
                continue;
            }

            list.Add(v);
        }

        return list;
    }

    /// <summary>
    /// When no explicit regions are stored, infer from the role (legacy users).
    /// </summary>
    public static IReadOnlyList<string> ResolveForRole(string role, IReadOnlyList<string>? storedRegions)
    {
        var explicitRegions = Normalize(storedRegions);
        if (explicitRegions.Count > 0)
        {
            return explicitRegions;
        }

        return role.Trim().ToLowerInvariant() switch
        {
            "receiver" => [Receiving],
            "collector" => [Collection],
            "finance" => [Receiving, Platform],
            "lead" => [Receiving, Collection, Warehouse, Platform],
            "clerk" => [Receiving, Warehouse, Collection],
            _ => [Receiving],
        };
    }
}
