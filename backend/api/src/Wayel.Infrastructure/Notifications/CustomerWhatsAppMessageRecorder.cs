using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Notifications;

internal sealed class CustomerWhatsAppMessageRecorder(
    ICustomerWhatsAppMessageLogRepository repository,
    IClock clock)
{
    public async Task RecordAsync(
        User? user,
        string? rawPhone,
        string body,
        string correlationTag,
        bool isImage,
        WhatsAppSendResult? sendResult,
        string? skipReason,
        CancellationToken cancellationToken)
    {
        var (parcelId, shipmentId, messageKind) = WhatsAppCorrelationParser.Parse(correlationTag);
        var phone = WhatsAppPhoneNormalizer.ToE164(rawPhone ?? user?.Phone ?? "") ?? rawPhone?.Trim() ?? "";

        string deliveryStatus;
        string? providerMessageId = null;
        string? errorCode = null;
        string? errorMessage = null;

        if (!string.IsNullOrWhiteSpace(skipReason))
        {
            deliveryStatus = "Skipped";
        }
        else if (sendResult is null)
        {
            deliveryStatus = "Skipped";
            skipReason = "Not sent";
        }
        else if (sendResult.IsSuccess)
        {
            deliveryStatus = "Sent";
            providerMessageId = sendResult.ProviderMessageId;
        }
        else
        {
            deliveryStatus = "Failed";
            errorCode = sendResult.ErrorCode;
            errorMessage = sendResult.ErrorMessage;
        }

        var entry = new CustomerWhatsAppMessageLogEntry(
            Guid.NewGuid(),
            user?.Id.Value,
            parcelId,
            shipmentId,
            correlationTag.Trim(),
            messageKind,
            body.Trim(),
            phone,
            deliveryStatus,
            skipReason,
            providerMessageId,
            errorCode,
            errorMessage,
            isImage,
            clock.UtcNow);

        await repository.AppendAsync(entry, cancellationToken).ConfigureAwait(false);
    }
}
