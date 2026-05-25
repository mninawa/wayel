using MongoDB.Driver;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoUserRepository(MongoContext context, IDomainEventCollector events) : IUserRepository
{
    public async Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken = default)
    {
        var doc = await context.Users.Find(x => x.Id == id).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalised = email.Trim().ToLowerInvariant();
        var doc = await context.Users.Find(x => x.Email == normalised).FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<bool> ExistsForEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalised = email.Trim().ToLowerInvariant();
        var count = await context.Users.CountDocumentsAsync(x => x.Email == normalised, cancellationToken: cancellationToken);
        return count > 0;
    }

    public async Task AddAsync(User user, CancellationToken cancellationToken = default)
    {
        await context.Users.InsertOneAsync(UserDocument.FromDomain(user), cancellationToken: cancellationToken);
        events.CollectFrom(user);
    }

    public async Task UpdateAsync(User user, CancellationToken cancellationToken = default)
    {
        await context.Users.ReplaceOneAsync(x => x.Id == user.Id, UserDocument.FromDomain(user), cancellationToken: cancellationToken);
        events.CollectFrom(user);
    }

    public async Task<IReadOnlyList<User>> ListByKycStatusAsync(
        KycStatus status,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.Users
            .Find(x => x.KycStatus == status && x.Role == UserRole.Customer)
            .SortByDescending(x => x.KycSubmittedAtUtc)
            .ThenByDescending(x => x.CreatedOnUtc)
            .ToListAsync(cancellationToken);
        return docs.ConvertAll(d => d.ToDomain());
    }

    public async Task<CustomerAccountPage> ListCustomersPageAsync(
        string? search,
        KycStatus? kycStatus,
        string? countryCode,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var filter = Builders<UserDocument>.Filter.Eq(x => x.Role, UserRole.Customer);

        if (kycStatus is not null)
        {
            filter &= Builders<UserDocument>.Filter.Eq(x => x.KycStatus, kycStatus.Value);
        }

        if (!string.IsNullOrWhiteSpace(countryCode))
        {
            filter &= Builders<UserDocument>.Filter.Eq(x => x.DestinationCountry, countryCode);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            var regex = new MongoDB.Bson.BsonRegularExpression(term, "i");
            filter &= Builders<UserDocument>.Filter.Or(
                Builders<UserDocument>.Filter.Regex(x => x.Email, regex),
                Builders<UserDocument>.Filter.Regex(x => x.DisplayName, regex),
                Builders<UserDocument>.Filter.Regex(x => x.FirstName, regex),
                Builders<UserDocument>.Filter.Regex(x => x.LastName, regex),
                Builders<UserDocument>.Filter.Regex(x => x.Phone!, regex),
                Builders<UserDocument>.Filter.Regex(x => x.IdNumber, regex));
        }

        var total = (int)await context.Users.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var skip = Math.Max(0, (page - 1) * pageSize);
        var docs = await context.Users
            .Find(filter)
            .SortByDescending(x => x.CreatedOnUtc)
            .Skip(skip)
            .Limit(pageSize)
            .ToListAsync(cancellationToken);

        return new CustomerAccountPage(docs.ConvertAll(d => d.ToDomain()), total);
    }
}
