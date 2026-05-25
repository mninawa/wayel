using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoQuoteCheckoutPaymentRepository(MongoContext context) : IQuoteCheckoutPaymentRepository
{
    public async Task<QuoteCheckoutPaymentRecord?> GetByReferenceAsync(
        string reference,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.QuoteCheckoutPayments
            .Find(x => x.Reference == reference)
            .FirstOrDefaultAsync(cancellationToken);

        return doc is null ? null : ToRecord(doc);
    }

    public async Task<QuoteCheckoutPaymentRecord?> GetPendingForQuoteAsync(
        QuoteId quoteId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.QuoteCheckoutPayments
            .Find(x => x.QuoteId == quoteId.Value && x.Status == "Pending")
            .SortByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(QuoteCheckoutPaymentRecord payment, CancellationToken cancellationToken = default) =>
        context.QuoteCheckoutPayments.InsertOneAsync(
            new QuoteCheckoutPaymentDocument
            {
                Reference = payment.Reference,
                UserId = payment.UserId.Value,
                QuoteId = payment.QuoteId.Value,
                AmountMinorUnits = payment.AmountMinorUnits,
                Status = payment.Status,
                CreatedAtUtc = payment.CreatedAtUtc,
                CompletedAtUtc = payment.CompletedAtUtc,
            },
            cancellationToken: cancellationToken);

    public Task MarkCompletedAsync(string reference, DateTime completedAtUtc, CancellationToken cancellationToken = default) =>
        context.QuoteCheckoutPayments.UpdateOneAsync(
            x => x.Reference == reference,
            Builders<QuoteCheckoutPaymentDocument>.Update
                .Set(x => x.Status, "Completed")
                .Set(x => x.CompletedAtUtc, completedAtUtc),
            cancellationToken: cancellationToken);

    public async Task<QuoteCheckoutPaymentRecord?> GetCompletedForQuoteAsync(
        QuoteId quoteId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.QuoteCheckoutPayments
            .Find(x => x.QuoteId == quoteId.Value && x.Status == "Completed")
            .SortByDescending(x => x.CompletedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return doc is null ? null : ToRecord(doc);
    }

    private static QuoteCheckoutPaymentRecord ToRecord(QuoteCheckoutPaymentDocument doc) =>
        new(
            doc.Reference,
            new UserId(doc.UserId),
            new QuoteId(doc.QuoteId),
            doc.AmountMinorUnits,
            doc.Status,
            doc.CreatedAtUtc,
            doc.CompletedAtUtc);
}
