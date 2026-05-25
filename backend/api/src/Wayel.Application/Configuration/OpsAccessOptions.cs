namespace Wayel.Application.Configuration;

/// <summary>Maps ops API keys to warehouse roles (clerk, lead, finance).</summary>
public sealed class OpsAccessOptions
{
    public const string SectionName = "OpsAccess";

    /// <summary>API key → role. Falls back to <c>lead</c> when the primary <see cref="KycOptions.OpsApiKey"/> matches.</summary>
    public Dictionary<string, string> RoleByApiKey { get; init; } =
        new(StringComparer.Ordinal);
}
