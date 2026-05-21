using Wayel.Application.Abstractions.Notifications;

namespace Wayel.Infrastructure.Notifications;

internal sealed class LoggingEmailTransport : IEmailTransport
{
    public string ProviderName => "logging";

    public Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken) =>
        Task.FromResult(new EmailSendResult("logging-stub"));
}
