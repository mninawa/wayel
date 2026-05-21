using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Addresses;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoCustomerAddressRepository(MongoContext context, IDomainEventCollector events)
    : ICustomerAddressRepository
{
    public async Task<CustomerAddress?> GetSuiteForUserAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var doc = await context.Addresses
            .Find(x => x.UserId == userId && x.IsSuiteAddress)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<CustomerAddress?> GetByIdForUserAsync(
        CustomerAddressId id,
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.Addresses
            .Find(x => x.Id == id && x.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<IReadOnlyList<CustomerAddress>> ListForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.Addresses.Find(x => x.UserId == userId).ToListAsync(cancellationToken);
        return docs.Select(d => d.ToDomain()).ToList();
    }

    public async Task AddAsync(CustomerAddress address, CancellationToken cancellationToken = default)
    {
        await context.Addresses.InsertOneAsync(CustomerAddressDocument.From(address), cancellationToken: cancellationToken);
        events.CollectFrom(address);
    }

    public async Task UpdateAsync(CustomerAddress address, CancellationToken cancellationToken = default)
    {
        await context.Addresses.ReplaceOneAsync(
            x => x.Id == address.Id,
            CustomerAddressDocument.From(address),
            cancellationToken: cancellationToken);
        events.CollectFrom(address);
    }

    public async Task DeleteAsync(CustomerAddressId id, UserId userId, CancellationToken cancellationToken = default)
    {
        await context.Addresses.DeleteOneAsync(x => x.Id == id && x.UserId == userId, cancellationToken);
    }
}
