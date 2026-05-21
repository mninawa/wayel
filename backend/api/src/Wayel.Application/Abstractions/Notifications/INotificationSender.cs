using Wayel.Domain.Invitations;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Sink for outbound, transactional user notifications.
///
/// Implementations are intentionally side-effecting and best-effort:
///   - The application invokes them after a unit-of-work commit, so the
///     business action (e.g. invitation issued) succeeds even if delivery
///     fails. The user can retry via "Resend".
///   - Implementations MUST NOT throw on transport failures — they should
///     log the failure and return. The handler logs at WARN level so a
///     dropped email is visible without breaking the calling request.
///
/// The contract is deliberately invitation-shaped today; we'll extend with
/// password-reset, billing-warning, etc. by adding sibling methods rather
/// than overloading <see cref="SendInvitationAsync"/>.
/// </summary>
public interface INotificationSender
{
    Task SendInvitationAsync(InvitationNotification notification, CancellationToken cancellationToken = default);

    /// <summary>
    /// Parent-facing email when a subscription request is approved or rejected.
    /// Must not throw on SES/SMTP failures.
    /// </summary>
    Task SendSubscriptionDecisionAsync(
        SubscriptionDecisionNotification notification,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Email the inviter ("staff X just accepted your invite") so they
    /// have a positive feedback loop. Best-effort — invitee onboarding
    /// already succeeded by the time we get here.
    /// </summary>
    Task SendInvitationAcceptedAsync(
        InvitationAcceptedNotification notification,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Recipient-facing co-parent invitation email. Phase-1 channel is
    /// email-only — there's no WhatsApp/SMS equivalent because the
    /// recipient is almost always the inviter's spouse / partner who
    /// already has the link via direct message anyway. The SES leg is
    /// here so the invite survives a "where did I file that text?"
    /// moment.
    /// </summary>
    Task SendCoParentInvitationAsync(
        CoParentInvitationNotification notification,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Parent-facing "your card was declined" email. Drives the
    /// dunning loop — a stale card silently lapses an enrolment if no
    /// household member notices, so this is the loud surface that
    /// arrives alongside the inbox row + push. Same best-effort
    /// posture as the rest of the surface (must not throw on
    /// transport failure).
    /// </summary>
    Task SendSubscriptionChargeFailedAsync(
        SubscriptionChargeFailedNotification notification,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Parent-facing "subscription renewed" receipt email. Sent only
    /// after a successful renewal charge, so the family has a paper
    /// trail for SARS / household budgeting outside the inbox.
    /// </summary>
    Task SendSubscriptionChargeSucceededAsync(
        SubscriptionChargeSucceededNotification notification,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// On-demand "email me my invoice" surface. The parent triggers
    /// this from the invoice detail page; we render a short cover
    /// note with the totals + a deep-link to view / download the
    /// PDF in the SPA. Same best-effort posture as the rest of this
    /// interface — the caller has already rate-limited the trigger.
    /// </summary>
    Task SendInvoiceEmailAsync(
        InvoiceEmailNotification notification,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Inputs to <see cref="INotificationSender.SendInvoiceEmailAsync"/>.
/// Carries the rendered totals + the metadata the cover-note template
/// needs (institution + child + period). The dispatcher builds the
/// absolute SPA deep-link from <see cref="InvoiceId"/> at send time —
/// both "View invoice" and "Download PDF" buttons in the email link
/// to the SPA detail page (the latter via a <c>?download=1</c>
/// query the SPA acts on at mount). We deliberately do NOT inline
/// the PDF as a MIME attachment so the bytes never escape the
/// parent's signed-in session.
/// </summary>
public sealed record InvoiceEmailNotification(
    Guid InvoiceId,
    Guid SubscriptionPeriodId,
    Guid TenantId,
    string ParentEmail,
    string ParentDisplayName,
    string InstitutionName,
    string ChildDisplayName,
    string InvoiceNumber,
    string Status,
    string FormattedTotal,
    DateTime IssuedOnUtc,
    DateTime DueOnUtc,
    DateTime? PaidOnUtc,
    Guid? RecipientUserId = null);

/// <summary>
/// Inputs to <see cref="INotificationSender.SendSubscriptionChargeFailedAsync"/>.
/// Carries the human-readable summary fields the template renders
/// (institution + amount + card tail) plus enough plumbing for the
/// gate (recipient user id) and the audit log (subscription period
/// id, payment id, attempt number).
/// </summary>
public sealed record SubscriptionChargeFailedNotification(
    Guid SubscriptionPeriodId,
    Guid PaymentId,
    Guid InvoiceId,
    Guid TenantId,
    string ParentEmail,
    string InstitutionName,
    string FormattedAmount,
    string? CardSummary,
    string? FailureReason,
    int AttemptNumber,
    Guid? RecipientUserId = null);

/// <summary>
/// Inputs to <see cref="INotificationSender.SendSubscriptionChargeSucceededAsync"/>.
/// Light receipt payload — the inbox row carries the full body; this
/// surface delivers the same narrative as a plain email so the parent
/// can forward it / file it for tax purposes.
/// </summary>
public sealed record SubscriptionChargeSucceededNotification(
    Guid SubscriptionPeriodId,
    Guid PaymentId,
    Guid InvoiceId,
    Guid TenantId,
    string ParentEmail,
    string InstitutionName,
    string FormattedAmount,
    string? CardSummary,
    string? InvoiceNumber,
    Guid? RecipientUserId = null);

/// <summary>
/// Inputs to <see cref="INotificationSender.SendCoParentInvitationAsync"/>.
/// Carries the *plaintext* token inline (same posture as
/// <see cref="InvitationNotification"/> — it never lands in the durable
/// outbox, only in the SES request body and the response surfaced
/// to the Primary's "Copy link" UI).
/// </summary>
public sealed record CoParentInvitationNotification(
    Guid InvitationId,
    Guid ParentId,
    string RecipientEmail,
    string PlaintextToken,
    DateTime ExpiresOnUtc,
    string? AcceptUrl,
    string InviterDisplayName,
    string HouseholdLabel,
    string? PersonalMessage,
    NotificationKind Kind);

/// <summary>
/// Payload for <see cref="INotificationSender.SendInvitationAcceptedAsync"/>.
/// <paramref name="InviterUserId"/> threads through to the gate so the
/// inviter's per-user opt-out applies to this category.
/// </summary>
public sealed record InvitationAcceptedNotification(
    Guid InvitationId,
    Guid TenantId,
    string InstitutionName,
    string Role,
    string InviterEmail,
    string AcceptedByDisplayName,
    string AcceptedByEmail,
    Guid? InviterUserId = null,
    string? InviterPhone = null);

/// <summary>Payload for <see cref="INotificationSender.SendSubscriptionDecisionAsync"/>.</summary>
/// <remarks>
/// <paramref name="RecipientUserId"/> threads the parent's owner-user id
/// through so the dispatcher's <c>INotificationGate</c> can apply the
/// per-user opt-out. May be null when the parent's user row is missing
/// (a corner case the gate handles by skipping the prefs leg).
///
/// <paramref name="ParentPhone"/> is optional — when present (and
/// in E.164-able form) the dispatcher will fan out a WhatsApp leg in
/// addition to the email. When absent the WhatsApp leg is silently
/// skipped (no error / no audit row); a parent without a phone simply
/// gets the email path only.
///
/// <para>
/// Approval-context fields (<paramref name="Cadence"/>,
/// <paramref name="TrialDays"/>, <paramref name="FirstChargeOnUtc"/>,
/// <paramref name="FormattedAmount"/>, <paramref name="InvoiceNumber"/>,
/// <paramref name="Classroom"/>, <paramref name="RequiresPaymentMethod"/>)
/// are only meaningful for the approved branch. Templates render them
/// conditionally — a free programme leaves the money fields null and
/// the message focuses on the enrolment confirmation alone.
/// </para>
/// </remarks>
public sealed record SubscriptionDecisionNotification(
    bool Approved,
    string ParentEmail,
    string InstitutionName,
    string ChildDisplayName,
    string? ProgramName,
    string? RejectionReason,
    Guid SubscriptionRequestId,
    Guid? RecipientUserId = null,
    string? ParentPhone = null,
    string? Cadence = null,
    int TrialDays = 0,
    DateTime? FirstChargeOnUtc = null,
    string? FormattedAmount = null,
    string? InvoiceNumber = null,
    string? Classroom = null,
    bool RequiresPaymentMethod = false,
    // Platform-fee breakdown — when present, the templates itemise the
    // institution amount + platform fee + total instead of the single
    // "headline" amount. <see cref="FormattedAmount"/> stays the
    // institution's portion (the programme price) for backward
    // compatibility; <see cref="FormattedPlatformFee"/> +
    // <see cref="FormattedTotal"/> are the new fields.
    string? FormattedPlatformFee = null,
    string? FormattedTotal = null);

/// <summary>
/// Inputs to <see cref="INotificationSender.SendInvitationAsync"/>. Carries
/// the *plaintext* invitation token, which never appears in the durable
/// outbox payload — handlers receive it inline so the secret stays out of
/// at-rest storage.
///
/// <paramref name="InstitutionName"/> is the recipient-facing display name of
/// the tenant the invitee is being added to (e.g. "Bright Buds Academy").
/// The template uses it verbatim in the subject and intro so the email
/// reads as "join Bright Buds on Wayel" rather than the older, anonymous
/// "join your institution on Wayel" — meaningful copy, especially for
/// recipients who belong to more than one workspace. Producers MUST pass
/// the live <c>tenant.Name</c> rather than a hard-coded fallback.
/// </summary>
public sealed record InvitationNotification(
    Guid InvitationId,
    Guid TenantId,
    string InstitutionName,
    string RecipientEmail,
    string? RecipientPhone,
    string Role,
    InvitationChannel Channel,
    string PlaintextToken,
    DateTime ExpiresOnUtc,
    string? AcceptUrl,
    NotificationKind Kind,
    string? PersonalMessage = null);

/// <summary>
/// Distinguishes "you've been invited" from "here's the token again because
/// you asked for a resend". Implementations may render different copy /
/// templates per kind, but both flow through the same transport.
/// </summary>
public enum NotificationKind
{
    InvitationIssued,
    InvitationResent,
}
