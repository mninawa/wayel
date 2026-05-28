using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Payments;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoCustomerSavedCardRepository(MongoContext context) : ICustomerSavedCardRepository
{
    public async Task<IReadOnlyList<CustomerSavedCardRecord>> ListActiveForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.CustomerSavedCards
            .Find(x => x.UserId == userId.Value && x.Status == "Active")
            .SortByDescending(x => x.IsDefault)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(ToRecord).ToList();
    }

    public async Task<CustomerSavedCardRecord?> GetByIdAsync(
        CustomerSavedCardId id,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.CustomerSavedCards
            .Find(x => x.Id == id.Value)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task<CustomerSavedCardRecord?> FindByAuthorizationCodeAsync(
        UserId userId,
        string authorizationCode,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.CustomerSavedCards
            .Find(x => x.UserId == userId.Value && x.AuthorizationCode == authorizationCode)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(CustomerSavedCardRecord card, CancellationToken cancellationToken = default) =>
        context.CustomerSavedCards.InsertOneAsync(
            new CustomerSavedCardDocument
            {
                Id = card.Id.Value,
                UserId = card.UserId.Value,
                Provider = card.Provider,
                AuthorizationCode = card.AuthorizationCode,
                CardType = card.CardType,
                Last4 = card.Last4,
                ExpMonth = card.ExpMonth,
                ExpYear = card.ExpYear,
                Bank = card.Bank,
                Label = card.Label,
                IsDefault = card.IsDefault,
                Status = card.Status,
                CreatedAtUtc = card.CreatedAtUtc,
                RevokedAtUtc = card.RevokedAtUtc,
            },
            cancellationToken: cancellationToken);

    public async Task SetDefaultAsync(
        UserId userId,
        CustomerSavedCardId cardId,
        CancellationToken cancellationToken = default)
    {
        await context.CustomerSavedCards.UpdateManyAsync(
            x => x.UserId == userId.Value && x.Status == "Active",
            Builders<CustomerSavedCardDocument>.Update.Set(x => x.IsDefault, false),
            cancellationToken: cancellationToken);

        await context.CustomerSavedCards.UpdateOneAsync(
            x => x.Id == cardId.Value && x.UserId == userId.Value,
            Builders<CustomerSavedCardDocument>.Update.Set(x => x.IsDefault, true),
            cancellationToken: cancellationToken);
    }

    public Task UpdateLabelAsync(
        CustomerSavedCardId cardId,
        string? label,
        CancellationToken cancellationToken = default) =>
        context.CustomerSavedCards.UpdateOneAsync(
            x => x.Id == cardId.Value,
            Builders<CustomerSavedCardDocument>.Update.Set(x => x.Label, label),
            cancellationToken: cancellationToken);

    public Task RevokeAsync(
        CustomerSavedCardId cardId,
        DateTime revokedAtUtc,
        CancellationToken cancellationToken = default) =>
        context.CustomerSavedCards.UpdateOneAsync(
            x => x.Id == cardId.Value,
            Builders<CustomerSavedCardDocument>.Update
                .Set(x => x.Status, "Revoked")
                .Set(x => x.IsDefault, false)
                .Set(x => x.RevokedAtUtc, revokedAtUtc),
            cancellationToken: cancellationToken);

    public Task DeleteAllForUserAsync(UserId userId, CancellationToken cancellationToken = default) =>
        context.CustomerSavedCards.DeleteManyAsync(
            x => x.UserId == userId.Value,
            cancellationToken: cancellationToken);

    private static CustomerSavedCardRecord ToRecord(CustomerSavedCardDocument doc) =>
        new(
            new CustomerSavedCardId(doc.Id),
            new UserId(doc.UserId),
            doc.Provider,
            doc.AuthorizationCode,
            doc.CardType,
            doc.Last4,
            doc.ExpMonth,
            doc.ExpYear,
            doc.Bank,
            doc.Label,
            doc.IsDefault,
            doc.Status,
            doc.CreatedAtUtc,
            doc.RevokedAtUtc);
}
