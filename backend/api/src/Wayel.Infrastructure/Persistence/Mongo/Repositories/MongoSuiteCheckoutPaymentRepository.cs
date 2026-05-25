using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuiteCheckoutPaymentRepository(MongoContext context) : ISuiteCheckoutPaymentRepository
{
    public async Task<SuiteCheckoutPaymentRecord?> GetByReferenceAsync(
        string reference,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.SuiteCheckoutPayments
            .Find(x => x.Reference == reference)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToRecord(doc);
    }

    public async Task<int> CountCompletedForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        return (int)await context.SuiteCheckoutPayments.CountDocumentsAsync(
            x => x.UserId == userId.Value
                 && x.Status == "Completed",
            cancellationToken: cancellationToken);
    }

    public Task AddAsync(SuiteCheckoutPaymentRecord payment, CancellationToken cancellationToken = default) =>
        context.SuiteCheckoutPayments.InsertOneAsync(
            new SuiteCheckoutPaymentDocument
            {
                Reference = payment.Reference,
                UserId = payment.UserId.Value,
                PlanId = payment.PlanId.Value,
                AmountMinorUnits = payment.AmountMinorUnits,
                Status = payment.Status,
                CreatedAtUtc = payment.CreatedAtUtc,
                CompletedAtUtc = payment.CompletedAtUtc,
            },
            cancellationToken: cancellationToken);

    public async Task<IReadOnlyList<SuiteCheckoutPaymentRecord>> ListForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var docs = await context.SuiteCheckoutPayments
            .Find(x => x.UserId == userId.Value)
            .SortByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        return docs.Select(ToRecord).ToList();
    }

    public Task MarkCompletedAsync(
        string reference,
        DateTime completedAtUtc,
        CancellationToken cancellationToken = default) =>
        context.SuiteCheckoutPayments.UpdateOneAsync(
            x => x.Reference == reference,
            Builders<SuiteCheckoutPaymentDocument>.Update
                .Set(x => x.Status, "Completed")
                .Set(x => x.CompletedAtUtc, completedAtUtc),
            cancellationToken: cancellationToken);

    private static SuiteCheckoutPaymentRecord ToRecord(SuiteCheckoutPaymentDocument doc) =>
        new(
            doc.Reference,
            new UserId(doc.UserId),
            new SuitePlanId(doc.PlanId),
            doc.AmountMinorUnits,
            doc.Status,
            doc.CreatedAtUtc,
            doc.CompletedAtUtc);
}
