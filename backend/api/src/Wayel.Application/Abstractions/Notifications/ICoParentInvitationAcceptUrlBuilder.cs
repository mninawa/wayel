namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Builds the canonical "accept co-parent invitation" URL the recipient
/// is sent and the Primary sees in the create / resend response.
///
/// <para>
/// Mirrors <see cref="IInvitationAcceptUrlBuilder"/> but always resolves
/// the same base URL — co-parent invites have no role variant. The
/// builder reads the configured base from
/// <c>NotificationOptions.AcceptUrlBaseByRole["CoParent"]</c> with a
/// fallback to the existing <c>Parent</c> base; tests can substitute a
/// deterministic stub.
/// </para>
/// </summary>
public interface ICoParentInvitationAcceptUrlBuilder
{
    /// <summary>
    /// Returns the fully-qualified URL to give the invitee, or
    /// <c>null</c> when no base URL is configured. Returning
    /// <c>null</c> (rather than throwing) lets the system keep
    /// functioning in tests / dev configurations that don't care
    /// about the link.
    /// </summary>
    string? Build(string plaintextToken);
}
