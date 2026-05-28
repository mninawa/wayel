using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;

namespace Wayel.Application.Features.Parcels;

/// <summary>Builds the receiving exceptions queue (same rules as the ops UI).</summary>
internal static class OpsReceivingExceptionScanner
{
    internal static async Task<IReadOnlyList<OpsExceptionItemDto>> ScanAllAsync(
        IParcelRepository parcels,
        IParcelInvoiceRepository invoices,
        IParcelOpsMetadataRepository opsMetadata,
        IParcelOpsExceptionRepository exceptionWorkflows,
        IUserRepository users,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var now = clock.UtcNow;
        var result = new List<OpsExceptionItemDto>();
        const int batchSize = 100;
        var offset = 0;

        while (true)
        {
            var batch = await parcels.ListRecentPageAsync(offset, batchSize, cancellationToken);
            if (batch.Count == 0)
            {
                break;
            }

            var workflows = await exceptionWorkflows.ListForParcelsAsync(
                batch.Select(p => p.Id).ToList(),
                cancellationToken);
            var workflowLookup = workflows.ToDictionary(w => (w.ParcelId, w.ExceptionType));

            foreach (var parcel in batch)
            {
                var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
                var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
                var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
                var exceptions = OpsExceptionRules.Detect(parcel, invoice, meta);
                foreach (var ex in exceptions)
                {
                    workflowLookup.TryGetValue((parcel.Id, ex.Type), out var workflow);
                    var status = workflow?.Status ?? ex.Status;
                    var dueAt = workflow?.DueAtUtc ?? OpsExceptionSla.DueAtUtc(parcel.ReceivedAtUtc, ex.Severity);
                    result.Add(new OpsExceptionItemDto(
                        parcel.Id.Value,
                        OpsParcelDisplayIds.Format(parcel),
                        parcel.TrackingNumber,
                        ex.Type,
                        ex.Severity,
                        status,
                        parcel.Retailer,
                        user?.DisplayName ?? "Customer",
                        parcel.SuiteNumber,
                        parcel.ReceivedAtUtc,
                        workflow?.AssignedTo,
                        workflow?.EscalatedTo,
                        dueAt,
                        OpsExceptionSla.IsOverdue(dueAt, status, now),
                        workflow?.Notes));
                }
            }

            offset += batch.Count;
            if (batch.Count < batchSize)
            {
                break;
            }
        }

        return result;
    }

    internal static bool IsOpen(OpsExceptionItemDto item) =>
        !string.Equals(item.Status, "RESOLVED", StringComparison.OrdinalIgnoreCase);
}
