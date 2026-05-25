using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoParcelOpsExceptionRepository(MongoContext context) : IParcelOpsExceptionRepository
{
    public async Task<ParcelOpsExceptionWorkflow?> GetAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.ParcelOpsExceptions
            .Find(x => x.ParcelId == parcelId && x.ExceptionType == exceptionType)
            .FirstOrDefaultAsync(cancellationToken);
        return doc is null ? null : ToDomain(doc);
    }

    public async Task<IReadOnlyList<ParcelOpsExceptionWorkflow>> ListForParcelsAsync(
        IReadOnlyCollection<ParcelId> parcelIds,
        CancellationToken cancellationToken = default)
    {
        if (parcelIds.Count == 0)
        {
            return [];
        }

        var docs = await context.ParcelOpsExceptions
            .Find(x => parcelIds.Contains(x.ParcelId))
            .ToListAsync(cancellationToken);
        return docs.Select(ToDomain).ToList();
    }

    public async Task UpsertAsync(ParcelOpsExceptionWorkflow workflow, CancellationToken cancellationToken = default)
    {
        var doc = FromDomain(workflow);
        await context.ParcelOpsExceptions.ReplaceOneAsync(
            x => x.ParcelId == workflow.ParcelId && x.ExceptionType == workflow.ExceptionType,
            doc,
            new ReplaceOptions { IsUpsert = true },
            cancellationToken);
    }

    private static ParcelOpsExceptionWorkflow ToDomain(ParcelOpsExceptionDocument doc) =>
        new(
            doc.ParcelId,
            doc.ExceptionType,
            doc.Status,
            doc.AssignedTo,
            doc.EscalatedTo,
            doc.Notes,
            doc.DueAtUtc,
            doc.EscalatedAtUtc,
            doc.UpdatedAtUtc);

    private static ParcelOpsExceptionDocument FromDomain(ParcelOpsExceptionWorkflow workflow) =>
        new()
        {
            ParcelId = workflow.ParcelId,
            ExceptionType = workflow.ExceptionType,
            Status = workflow.Status,
            AssignedTo = workflow.AssignedTo,
            EscalatedTo = workflow.EscalatedTo,
            Notes = workflow.Notes,
            DueAtUtc = workflow.DueAtUtc,
            EscalatedAtUtc = workflow.EscalatedAtUtc,
            UpdatedAtUtc = workflow.UpdatedAtUtc,
        };
}
