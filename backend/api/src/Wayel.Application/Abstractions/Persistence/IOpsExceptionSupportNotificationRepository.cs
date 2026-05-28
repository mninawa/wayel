using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

/// <summary>
/// Tracks which open receiving exceptions have already pinged the support WhatsApp inbox.
/// </summary>
public interface IOpsExceptionSupportNotificationRepository
{
    Task<bool> WasNotifiedAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default);

    Task MarkNotifiedAsync(
        ParcelId parcelId,
        string exceptionType,
        DateTime notifiedAtUtc,
        CancellationToken cancellationToken = default);

    Task ClearAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default);
}
