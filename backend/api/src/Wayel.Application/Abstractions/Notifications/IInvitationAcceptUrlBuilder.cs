namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Builds the canonical "accept invitation" URL the recipient is sent and
/// the SuperAdmin sees in the issue / resend response.
///
/// Lives in <c>Wayel.Application</c> (rather than next to
/// <see cref="INotificationSender"/>'s implementation) because the URL is
/// part of the wire contract returned by the create / resend handlers, not
/// merely a notification-renderer concern. Centralising the builder means
/// the link in the email and the link the admin pastes into Slack are the
/// same string — no more "we sent them <c>/invitations/accept</c> but the
/// admin's banner says <c>/staff/accept</c>" drift.
///
/// The infrastructure implementation reads the configured base URL
/// (per-role overrides + default fallback) from <c>NotificationOptions</c>;
/// tests can substitute a deterministic stub.
/// </summary>
public interface IInvitationAcceptUrlBuilder
{
    /// <summary>
    /// Returns the fully-qualified URL to give the invitee, or <c>null</c>
    /// when no base URL is configured for the given role. Returning
    /// <c>null</c> (rather than throwing) lets the system keep functioning
    /// in tests / dev configurations that don't care about the link;
    /// callers that need a guaranteed URL must validate config at startup.
    /// </summary>
    /// <param name="role">Role string from the invitation (e.g. <c>TenantAdmin</c>, <c>Staff</c>).</param>
    /// <param name="plaintextToken">Single-use plaintext token. Will be URL-encoded by the implementation.</param>
    string? Build(string role, string plaintextToken);
}
