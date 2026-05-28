namespace Wayel.Application.Abstractions.Persistence;

public sealed record CustomerWhatsAppMessageLogEntry(
    Guid Id,
    Guid? UserId,
    Guid? ParcelId,
    Guid? ShipmentId,
    string CorrelationTag,
    string MessageKind,
    string Body,
    string PhoneE164,
    string DeliveryStatus,
    string? SkipReason,
    string? ProviderMessageId,
    string? ErrorCode,
    string? ErrorMessage,
    bool IsImage,
    DateTime SentAtUtc);

public interface ICustomerWhatsAppMessageLogRepository
{
    Task AppendAsync(CustomerWhatsAppMessageLogEntry entry, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CustomerWhatsAppMessageLogEntry>> ListForParcelAsync(
        Guid parcelId,
        int limit,
        CancellationToken cancellationToken = default);

    Task<CustomerWhatsAppMessageLogEntry?> GetLatestByCorrelationTagAsync(
        string correlationTag,
        CancellationToken cancellationToken = default);
}
