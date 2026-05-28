using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoPaymentMethodAddIntentRepository(MongoContext context) : IPaymentMethodAddIntentRepository
{
    public async Task<PaymentMethodAddIntentRecord?> GetByReferenceAsync(
        string reference,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.PaymentMethodAddIntents
            .Find(x => x.Reference == reference)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public Task AddAsync(PaymentMethodAddIntentRecord intent, CancellationToken cancellationToken = default) =>
        context.PaymentMethodAddIntents.InsertOneAsync(
            new PaymentMethodAddIntentDocument
            {
                Reference = intent.Reference,
                UserId = intent.UserId.Value,
                AmountMinorUnits = intent.AmountMinorUnits,
                Status = intent.Status,
                Label = intent.Label,
                CreatedAtUtc = intent.CreatedAtUtc,
                CompletedAtUtc = intent.CompletedAtUtc,
            },
            cancellationToken: cancellationToken);

    public Task MarkCompletedAsync(
        string reference,
        DateTime completedAtUtc,
        CancellationToken cancellationToken = default) =>
        context.PaymentMethodAddIntents.UpdateOneAsync(
            x => x.Reference == reference,
            Builders<PaymentMethodAddIntentDocument>.Update
                .Set(x => x.Status, "Completed")
                .Set(x => x.CompletedAtUtc, completedAtUtc),
            cancellationToken: cancellationToken);

    private static PaymentMethodAddIntentRecord ToRecord(PaymentMethodAddIntentDocument doc) =>
        new(
            doc.Reference,
            new UserId(doc.UserId),
            doc.AmountMinorUnits,
            doc.Status,
            doc.Label,
            doc.CreatedAtUtc,
            doc.CompletedAtUtc);
}
