using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoQuoteRepository(MongoContext context, IDomainEventCollector events) : IQuoteRepository
{
    public async Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Quotes.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : await ResolveAsync(doc, cancellationToken);
    }

    public async Task<IReadOnlyList<Quote>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var shipmentIds = await context.Shipments
            .Find(x => x.UserId == userId)
            .Project(x => x.Id)
            .ToListAsync(cancellationToken);
        var shipmentIdSet = shipmentIds.ToHashSet();

        var byUser = await context.Quotes
            .Find(x => x.UserId == userId)
            .SortByDescending(x => x.CreatedAtUtc)
            .ThenByDescending(x => x.ValidUntil)
            .ToListAsync(cancellationToken);

        var legacyUserId = new UserId(Guid.Empty);
        var legacyDocs = shipmentIdSet.Count == 0
            ? []
            : await context.Quotes
                .Find(x => x.UserId == legacyUserId)
                .ToListAsync(cancellationToken);

        var docs = byUser
            .Concat(legacyDocs.Where(d => d.ShipmentId is { } sid && shipmentIdSet.Contains(sid)))
            .DistinctBy(d => d.Id.Value)
            .OrderByDescending(d => d.CreatedAtUtc)
            .ThenByDescending(d => d.ValidUntil)
            .ToList();

        var results = new List<Quote>();
        foreach (var doc in docs)
        {
            var quote = await ResolveAsync(doc, cancellationToken);
            if (quote is not null)
            {
                results.Add(quote);
            }
        }

        return results;
    }

    public async Task AddAsync(Quote quote, CancellationToken cancellationToken = default)
    {
        await context.Quotes.InsertOneAsync(QuoteDocument.From(quote), cancellationToken: cancellationToken);
        events.CollectFrom(quote);
    }

    public async Task UpdateAsync(Quote quote, CancellationToken cancellationToken = default)
    {
        await context.Quotes.ReplaceOneAsync(
            x => x.Id == quote.Id,
            QuoteDocument.From(quote),
            cancellationToken: cancellationToken);
        events.CollectFrom(quote);
    }

    private async Task<Quote?> ResolveAsync(QuoteDocument doc, CancellationToken cancellationToken)
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

        if (doc.Status == default && doc.ApprovalStatus != default)
        {
            doc.Status = doc.ApprovalStatus switch
            {
                QuoteApprovalStatus.Approved => QuoteStatus.Approved,
                QuoteApprovalStatus.Locked => QuoteStatus.BlockedSuiteExpired,
                QuoteApprovalStatus.Rejected => QuoteStatus.Cancelled,
                _ => QuoteStatus.Approved,
            };
        }

        if (string.IsNullOrWhiteSpace(doc.DeliveryMethod))
        {
            doc.DeliveryMethod = "Door-to-Door";
        }

        if (doc.CreatedAtUtc == default)
        {
            doc.CreatedAtUtc = doc.ValidUntil.AddDays(-7);
        }

        return doc.ToDomain();
    }
}
