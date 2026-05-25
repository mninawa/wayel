using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record ParcelOpsActivityEvent(
    Guid Id,
    ParcelId ParcelId,
    string EventType,
    string Title,
    string? Detail,
    string? Actor,
    DateTime OccurredAtUtc);

public interface IParcelOpsActivityRepository
{
    Task AppendAsync(ParcelOpsActivityEvent activity, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ParcelOpsActivityEvent>> ListForParcelAsync(
        ParcelId parcelId,
        int limit,
        CancellationToken cancellationToken = default);
}
