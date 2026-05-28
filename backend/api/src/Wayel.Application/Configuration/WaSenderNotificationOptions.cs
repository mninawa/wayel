namespace Wayel.Application.Configuration;

/// <summary>
/// Read-only view of <c>Notifications:WaSender</c> for application features
/// (support test, overview flags). Transport credentials stay in Infrastructure.
/// </summary>
public sealed class WaSenderNotificationOptions
{
    public const string SectionName = "Notifications:WaSender";

    public bool Enabled { get; init; }

    public string? ApiKey { get; init; }

    public bool IsConfiguredForDelivery =>
        Enabled && !string.IsNullOrWhiteSpace(ApiKey);
}
