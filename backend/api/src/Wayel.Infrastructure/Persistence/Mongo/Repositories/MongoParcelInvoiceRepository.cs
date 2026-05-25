using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelInvoiceRepository(MongoContext context, IDomainEventCollector events)
    : IParcelInvoiceRepository
{
    public async Task<ParcelInvoice?> GetForParcelAsync(ParcelId parcelId, CancellationToken cancellationToken = default)
    {
        var doc = await context.ParcelInvoices
            .Find(x => x.ParcelId == parcelId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<IReadOnlyDictionary<ParcelId, ParcelInvoice>> ListForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.ParcelInvoices.Find(x => x.UserId == userId).ToListAsync(cancellationToken);
        return docs.ToDictionary(d => d.ParcelId, d => d.ToDomain());
    }

    public async Task AddAsync(ParcelInvoice invoice, CancellationToken cancellationToken = default)
    {
        await context.ParcelInvoices.InsertOneAsync(
            ParcelInvoiceDocument.From(invoice),
            cancellationToken: cancellationToken);
        events.CollectFrom(invoice);
    }

    public async Task ReplaceAsync(ParcelInvoice invoice, CancellationToken cancellationToken = default)
    {
        await context.ParcelInvoices.ReplaceOneAsync(
            x => x.Id == invoice.Id,
            ParcelInvoiceDocument.From(invoice),
            cancellationToken: cancellationToken);
        events.CollectFrom(invoice);
    }
}
