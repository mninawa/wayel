using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Best-effort email notifications for WeYell / BorderBox customers.
/// Never throws — failures are logged only.
/// </summary>
public interface IBorderBoxEmailNotifier
{
    Task NotifyReadyForCollectionAsync(
        User user,
        Guid shipmentId,
        string shipmentDisplayId,
        string hubName,
        string hubCity,
        CancellationToken cancellationToken = default);
}
