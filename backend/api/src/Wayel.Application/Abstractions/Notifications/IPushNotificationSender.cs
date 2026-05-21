using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Sends push notifications to a user's registered mobile devices via FCM.
/// Implementations handle token lookup, fan-out to multiple devices, and
/// stale-token cleanup.
/// </summary>
public interface IPushNotificationSender
{
    /// <summary>
    /// Send a push notification to all registered devices for the given user.
    /// </summary>
    Task SendAsync(
        UserId recipientUserId,
        string title,
        string body,
        Dictionary<string, string>? data = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Fan-out a push notification to every device registered to any of
    /// the given users. Used for co-parenting / multi-guardian
    /// households so a single domain event reaches every guardian's
    /// phone. Per-recipient failures must NOT cancel the rest — a stale
    /// FCM token on Mom's old phone should not deny Dad the push.
    /// Implementations are expected to log+swallow per-user errors and
    /// always return without throwing.
    /// </summary>
    Task SendAsync(
        IEnumerable<UserId> recipientUserIds,
        string title,
        string body,
        Dictionary<string, string>? data = null,
        CancellationToken cancellationToken = default);
}
