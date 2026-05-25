using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoQuotePaymentInvoiceRepository(MongoContext context) : IQuotePaymentInvoiceRepository
{
    public async Task<QuotePaymentInvoiceRecord?> GetByQuoteIdAsync(
        QuoteId quoteId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.QuotePaymentInvoices
            .Find(x => x.QuoteId == quoteId.Value)
            .FirstOrDefaultAsync(cancellationToken);

        return doc is null ? null : ToRecord(doc);
    }

    public async Task<IReadOnlyDictionary<Guid, QuotePaymentInvoiceRecord>> ListByQuoteIdsAsync(
        IReadOnlyCollection<Guid> quoteIds,
        CancellationToken cancellationToken = default)
    {
        if (quoteIds.Count == 0)
        {
            return new Dictionary<Guid, QuotePaymentInvoiceRecord>();
        }

        var docs = await context.QuotePaymentInvoices
            .Find(x => quoteIds.Contains(x.QuoteId))
            .ToListAsync(cancellationToken);

        return docs.ToDictionary(d => d.QuoteId, ToRecord);
    }

    public Task UpsertAsync(QuotePaymentInvoiceRecord invoice, CancellationToken cancellationToken = default) =>
        context.QuotePaymentInvoices.ReplaceOneAsync(
            x => x.QuoteId == invoice.QuoteId.Value,
            new QuotePaymentInvoiceDocument
            {
                QuoteId = invoice.QuoteId.Value,
                UserId = invoice.UserId.Value,
                InvoiceNumber = invoice.InvoiceNumber,
                PaymentReference = invoice.PaymentReference,
                PaidAtUtc = invoice.PaidAtUtc,
                AmountZar = invoice.AmountZar,
                StorageKey = invoice.StorageKey,
                FileName = invoice.FileName,
                PaymentProvider = string.IsNullOrWhiteSpace(invoice.PaymentProvider)
                    ? "paystack"
                    : invoice.PaymentProvider,
            },
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);

    private static QuotePaymentInvoiceRecord ToRecord(QuotePaymentInvoiceDocument doc) =>
        new(
            new QuoteId(doc.QuoteId),
            new UserId(doc.UserId),
            doc.InvoiceNumber,
            doc.PaymentReference,
            doc.PaidAtUtc,
            doc.AmountZar,
            doc.StorageKey,
            doc.FileName,
            string.IsNullOrWhiteSpace(doc.PaymentProvider) ? "paystack" : doc.PaymentProvider);
}
