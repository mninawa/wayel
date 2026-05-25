using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SupportTickets;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSupportTicketRepository(MongoContext context, IDomainEventCollector events)
    : ISupportTicketRepository
{
    public async Task<SupportTicket?> GetByIdAsync(SupportTicketId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.SupportTickets.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<IReadOnlyList<SupportTicket>> ListForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.SupportTickets
            .Find(x => x.UserId == userId)
            .SortByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task AddAsync(SupportTicket ticket, CancellationToken cancellationToken = default)
    {
        await context.SupportTickets.InsertOneAsync(
            SupportTicketDocument.From(ticket),
            cancellationToken: cancellationToken);
        events.CollectFrom(ticket);
    }
}
