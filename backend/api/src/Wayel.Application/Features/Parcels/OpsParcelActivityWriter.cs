using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

internal static class OpsParcelActivityWriter
{
    internal static Task LogAsync(
        IParcelOpsActivityRepository activities,
        ParcelId parcelId,
        string eventType,
        string title,
        string? detail,
        string? actor,
        DateTime occurredAtUtc,
        CancellationToken cancellationToken) =>
        activities.AppendAsync(
            new ParcelOpsActivityEvent(
                Guid.NewGuid(),
                parcelId,
                eventType,
                title,
                detail,
                actor,
                occurredAtUtc),
            cancellationToken);
}
