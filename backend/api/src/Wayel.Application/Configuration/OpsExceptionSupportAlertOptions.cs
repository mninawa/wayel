namespace Wayel.Application.Configuration;

/// <summary>
/// Polls the receiving exceptions queue and pings the ops support WhatsApp inbox
/// when new open exceptions are detected.
/// </summary>
public sealed class OpsExceptionSupportAlertOptions
{
    public const string SectionName = "BorderBox:OpsExceptionSupportAlerts";

    public bool Enabled { get; init; } = true;

    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMinutes(5);

    public int MaxAlertsPerRun { get; init; } = 15;

    /// <summary>Ops portal origin (no trailing slash), e.g. http://localhost:8081.</summary>
    public string OpsPortalBaseUrl { get; init; } = "http://localhost:8081";

    public string ExceptionsPath { get; init; } = "/ops/receiving/exceptions";
}
