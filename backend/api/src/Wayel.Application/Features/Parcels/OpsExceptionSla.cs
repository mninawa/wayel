namespace Wayel.Application.Features.Parcels;

internal static class OpsExceptionSla
{
    internal static DateTime DueAtUtc(DateTime receivedAtUtc, string severity) =>
        severity.ToUpperInvariant() switch
        {
            "HIGH" => receivedAtUtc.AddHours(4),
            "MEDIUM" => receivedAtUtc.AddHours(24),
            _ => receivedAtUtc.AddHours(72),
        };

    internal static bool IsOverdue(DateTime? dueAtUtc, string status, DateTime nowUtc) =>
        dueAtUtc is not null &&
        nowUtc > dueAtUtc.Value &&
        status is not "RESOLVED";
}
