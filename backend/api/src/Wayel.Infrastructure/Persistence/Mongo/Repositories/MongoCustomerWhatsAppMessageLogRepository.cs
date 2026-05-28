using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoCustomerWhatsAppMessageLogRepository(MongoContext context)
    : ICustomerWhatsAppMessageLogRepository
{
    public async Task AppendAsync(
        CustomerWhatsAppMessageLogEntry entry,
        CancellationToken cancellationToken = default)
    {
        var doc = new CustomerWhatsAppMessageDocument
        {
            Id = entry.Id,
            UserId = entry.UserId,
            ParcelId = entry.ParcelId,
            ShipmentId = entry.ShipmentId,
            CorrelationTag = entry.CorrelationTag,
            MessageKind = entry.MessageKind,
            Body = entry.Body,
            PhoneE164 = entry.PhoneE164,
            DeliveryStatus = entry.DeliveryStatus,
            SkipReason = entry.SkipReason,
            ProviderMessageId = entry.ProviderMessageId,
            ErrorCode = entry.ErrorCode,
            ErrorMessage = entry.ErrorMessage,
            IsImage = entry.IsImage,
            SentAtUtc = entry.SentAtUtc,
        };

        await context.CustomerWhatsAppMessages
            .InsertOneAsync(doc, cancellationToken: cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<CustomerWhatsAppMessageLogEntry>> ListForParcelAsync(
        Guid parcelId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var cap = Math.Clamp(limit, 1, 200);
        var docs = await context.CustomerWhatsAppMessages
            .Find(x => x.ParcelId == parcelId)
            .SortByDescending(x => x.SentAtUtc)
            .Limit(cap)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return docs.Select(Map).ToList();
    }

    public async Task<CustomerWhatsAppMessageLogEntry?> GetLatestByCorrelationTagAsync(
        string correlationTag,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(correlationTag))
        {
            return null;
        }

        var doc = await context.CustomerWhatsAppMessages
            .Find(x => x.CorrelationTag == correlationTag.Trim())
            .SortByDescending(x => x.SentAtUtc)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return doc is null ? null : Map(doc);
    }

    private static CustomerWhatsAppMessageLogEntry Map(CustomerWhatsAppMessageDocument doc) =>
        new(
            doc.Id,
            doc.UserId,
            doc.ParcelId,
            doc.ShipmentId,
            doc.CorrelationTag,
            doc.MessageKind,
            doc.Body,
            doc.PhoneE164,
            doc.DeliveryStatus,
            doc.SkipReason,
            doc.ProviderMessageId,
            doc.ErrorCode,
            doc.ErrorMessage,
            doc.IsImage,
            doc.SentAtUtc);
}
