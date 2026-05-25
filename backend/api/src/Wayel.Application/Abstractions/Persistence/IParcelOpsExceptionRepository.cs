using Wayel.Domain.Parcels;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record ParcelOpsExceptionWorkflow(
    ParcelId ParcelId,
    string ExceptionType,
    string Status,
    string? AssignedTo,
    string? EscalatedTo,
    string? Notes,
    DateTime? DueAtUtc,
    DateTime? EscalatedAtUtc,
    DateTime UpdatedAtUtc);

public interface IParcelOpsExceptionRepository
{
    Task<ParcelOpsExceptionWorkflow?> GetAsync(
        ParcelId parcelId,
        string exceptionType,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ParcelOpsExceptionWorkflow>> ListForParcelsAsync(
        IReadOnlyCollection<ParcelId> parcelIds,
        CancellationToken cancellationToken = default);

    Task UpsertAsync(ParcelOpsExceptionWorkflow workflow, CancellationToken cancellationToken = default);
}
