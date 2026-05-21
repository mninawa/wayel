using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Quotes;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoQuoteRepository(MongoContext context, IDomainEventCollector events) : IQuoteRepository
{
    public async Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Quotes.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task AddAsync(Quote quote, CancellationToken cancellationToken = default)
    {
        await context.Quotes.InsertOneAsync(QuoteDocument.From(quote), cancellationToken: cancellationToken);
        events.CollectFrom(quote);
    }

    public async Task UpdateAsync(Quote quote, CancellationToken cancellationToken = default)
    {
        await context.Quotes.ReplaceOneAsync(x => x.Id == quote.Id, QuoteDocument.From(quote), cancellationToken: cancellationToken);
        events.CollectFrom(quote);
    }
}
