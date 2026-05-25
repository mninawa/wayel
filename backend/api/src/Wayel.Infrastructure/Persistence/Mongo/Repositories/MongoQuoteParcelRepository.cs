using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoQuoteParcelRepository(MongoContext context) : IQuoteParcelRepository
{
    private IMongoCollection<QuoteParcelDocument> Collection =>
        context.Database.GetCollection<QuoteParcelDocument>("quote_parcels");

    public async Task<IReadOnlyList<QuoteParcel>> ListForQuoteAsync(
        QuoteId quoteId,
        CancellationToken cancellationToken = default)
    {
        var docs = await Collection.Find(x => x.QuoteId == quoteId).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<QuoteParcel>> ListForParcelAsync(
        ParcelId parcelId,
        CancellationToken cancellationToken = default)
    {
        var docs = await Collection
            .Find(x => x.ParcelId == parcelId)
            .SortByDescending(x => x.QuoteId)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<IReadOnlyList<QuoteParcel>> ListForUserParcelsAsync(
        UserId userId,
        IEnumerable<ParcelId> parcelIds,
        CancellationToken cancellationToken = default)
    {
        var ids = parcelIds.ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var docs = await Collection.Find(x => ids.Contains(x.ParcelId)).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task<Quote?> FindOpenQuoteForParcelAsync(
        ParcelId parcelId,
        CancellationToken cancellationToken = default)
    {
        var links = await ListForParcelAsync(parcelId, cancellationToken);
        foreach (var link in links)
        {
            var quoteDoc = await context.Quotes.Find(x => x.Id == link.QuoteId).FirstOrDefaultAsync(cancellationToken);
            if (quoteDoc is null)
            {
                continue;
            }

            var quote = await ResolveQuoteDocumentAsync(quoteDoc, cancellationToken);
            if (quote is not null && QuoteStatusRules.IsOpen(quote.Status))
            {
                return quote;
            }
        }

        return null;
    }

    public async Task AddAsync(QuoteParcel link, CancellationToken cancellationToken = default) =>
        await Collection.InsertOneAsync(QuoteParcelDocument.From(link), cancellationToken: cancellationToken);

    public async Task AddManyAsync(IEnumerable<QuoteParcel> links, CancellationToken cancellationToken = default)
    {
        var docs = links.Select(QuoteParcelDocument.From).ToList();
        if (docs.Count > 0)
        {
            await Collection.InsertManyAsync(docs, cancellationToken: cancellationToken);
        }
    }

    private async Task<Quote?> ResolveQuoteDocumentAsync(
        QuoteDocument doc,
        CancellationToken cancellationToken)
    {
        if (doc.UserId.Value == Guid.Empty && doc.ShipmentId is { } shipmentId)
        {
            var shipment = await context.Shipments
                .Find(x => x.Id == shipmentId)
                .FirstOrDefaultAsync(cancellationToken);
            if (shipment is not null)
            {
                doc.UserId = shipment.UserId;
            }
        }

        return doc.ToDomain();
    }
}
