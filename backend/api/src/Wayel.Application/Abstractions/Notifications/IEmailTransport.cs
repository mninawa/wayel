namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Provider-agnostic transport for outbound transactional email. The
/// caller (<c>DispatchingNotificationSender</c>) renders the email body
/// and hands a fully-formed <see cref="EmailMessage"/> off to the
/// transport, which handles authentication, signing, and the actual
/// HTTPS call to whichever provider is configured (AWS SES, Resend,
/// Postmark, etc.).
///
/// <para>
/// Implementations MUST throw on transport failure; the caller catches
/// and audit-logs. This keeps the "no-throw" no-throw contract on
/// <see cref="INotificationSender"/> while letting individual transports
/// surface real provider error messages.
/// </para>
/// </summary>
public interface IEmailTransport
{
    /// <summary>
    /// Send a single email via the configured provider. Returns the
    /// provider-assigned message id (used for audit-log correlation
    /// with bounce / complaint webhooks).
    /// </summary>
    Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken);

    /// <summary>
    /// Short identifier (e.g. <c>"ses"</c>, <c>"resend"</c>) used in log
    /// messages so operators can tell which provider an email went via.
    /// </summary>
    string ProviderName { get; }
}

/// <summary>
/// Inputs to <see cref="IEmailTransport.SendAsync"/>. The body has
/// already been rendered by the caller; transports do not template.
///
/// <para>
/// <c>CorrelationTag</c> is the provider-specific tag used to
/// correlate bounce / complaint webhooks back to a specific outbound
/// row. Resend stores it as a `tags` entry, SES as a configuration-set
/// + tags pair.
/// </para>
/// </summary>
public sealed record EmailMessage(
    string FromAddress,
    string? FromDisplayName,
    string ToAddress,
    string Subject,
    string TextBody,
    string HtmlBody,
    string? CorrelationTag = null);

/// <summary>
/// Result envelope for <see cref="IEmailTransport.SendAsync"/>. The
/// only field every provider supplies is a message id; we keep the
/// shape minimal so adding a third provider doesn't require new fields.
/// </summary>
public sealed record EmailSendResult(string ProviderMessageId);
