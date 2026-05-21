using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Notifications;

namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// AWS SES implementation of <see cref="IEmailTransport"/>. Uses the
/// SDK's default credential chain (env vars / shared profile / IAM
/// role) — host wires <see cref="IAmazonSimpleEmailService"/> when
/// <c>Notifications:Provider == "ses"</c>.
/// </summary>
internal sealed class SesEmailTransport(
    IAmazonSimpleEmailService client,
    IOptions<NotificationSesOptions> options) : IEmailTransport
{
    public string ProviderName => "ses";

    public async Task<EmailSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var ses = options.Value;
        var source = FormatSource(message.FromAddress, message.FromDisplayName);

        var request = new SendEmailRequest
        {
            Source = source,
            Destination = new Destination { ToAddresses = [message.ToAddress.Trim()] },
            Message = new Message
            {
                Subject = new Content { Charset = "UTF-8", Data = message.Subject },
                Body = new Body
                {
                    Text = new Content { Charset = "UTF-8", Data = message.TextBody },
                    Html = new Content { Charset = "UTF-8", Data = message.HtmlBody },
                },
            },
        };

        if (!string.IsNullOrWhiteSpace(ses.ConfigurationSetName))
        {
            request.ConfigurationSetName = ses.ConfigurationSetName;
        }

        var response = await client.SendEmailAsync(request, cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrEmpty(response.MessageId))
        {
            throw new InvalidOperationException("SES SendEmail returned an empty MessageId.");
        }

        return new EmailSendResult(response.MessageId);
    }

    private static string FormatSource(string fromAddress, string? fromDisplayName)
    {
        var address = fromAddress.Trim();
        if (string.IsNullOrWhiteSpace(fromDisplayName))
        {
            return address;
        }

        return $"\"{fromDisplayName!.Trim().Replace("\"", "'")}\" <{address}>";
    }
}
