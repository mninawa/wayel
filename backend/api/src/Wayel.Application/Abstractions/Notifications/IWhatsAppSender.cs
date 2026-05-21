namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Sink for outbound WhatsApp messages. Implementations are best-effort and
/// MUST NOT throw on transport failures — they should log and return so the
/// calling business action (e.g. invitation issued) is never rolled back by
/// a downstream provider hiccup.
///
/// <para>
/// The contract is free-form text on purpose. Earlier revisions targeted
/// Meta's WhatsApp Business Cloud API, which only allows unsolicited
/// messages against pre-approved templates, so the interface was shaped
/// around template names + positional body parameters. The current
/// transport (WasenderAPI) drives a QR-linked WhatsApp session that
/// sends plain text; the message is rendered upstream by
/// <c>NotificationTemplates</c> and handed to this sink as a finished
/// string.
/// </para>
///
/// <para>
/// Trade-off note for future readers considering a swap back to Meta:
/// the template-shaped abstraction is strictly more expressive than this
/// one (templates can carry header parameters, URL button params,
/// quick-reply suggestions etc. that plain text can't represent).
/// Re-broadening this interface to a discriminated <c>SendText</c> +
/// <c>SendTemplate</c> pair is the migration path back. Until then,
/// every WhatsApp message we ship is a single body of plain text.
/// </para>
/// </summary>
public interface IWhatsAppSender
{
    /// <summary>
    /// Send a plain-text WhatsApp message. Caller is responsible for
    /// passing the recipient phone in E.164 form (with leading <c>+</c>);
    /// senders MAY strip or keep the <c>+</c> depending on the provider's
    /// wire format. The body is the finished string the recipient will
    /// see — no further rendering is performed downstream.
    /// </summary>
    Task<WhatsAppSendResult> SendTextAsync(
        WhatsAppTextMessage message,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Plain-text WhatsApp message. <paramref name="Body"/> is the already-rendered
/// string (templates resolve in <c>NotificationTemplates</c> on the
/// dispatcher side). <paramref name="CorrelationTag"/> is an opaque
/// identifier the sender stamps into logs / audit so a single outbound
/// row can be traced end-to-end (e.g. <c>invitation:{guid}</c>).
/// </summary>
public sealed record WhatsAppTextMessage(
    string ToPhoneE164,
    string Body,
    string? CorrelationTag = null);

/// <summary>
/// Outcome of a single WhatsApp send. Distinct from "throw" so callers can
/// fall through to a console fallback without conflating provider errors
/// with bugs in their own code.
/// </summary>
public sealed record WhatsAppSendResult(
    bool IsSuccess,
    string? ProviderMessageId,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static WhatsAppSendResult Success(string providerMessageId) =>
        new(true, providerMessageId, null, null);

    public static WhatsAppSendResult Failure(string errorCode, string errorMessage) =>
        new(false, null, errorCode, errorMessage);
}
