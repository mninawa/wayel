using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

internal static class OpsReceivingAggregation
{
    internal static int CountExceptions(
        IReadOnlyList<Parcel> parcels,
        IReadOnlyDictionary<ParcelId, ParcelInvoice?> invoicesByParcel,
        IReadOnlyDictionary<ParcelId, ParcelOpsMetadata?> metadataByParcel)
    {
        var count = 0;
        foreach (var parcel in parcels)
        {
            invoicesByParcel.TryGetValue(parcel.Id, out var invoice);
            metadataByParcel.TryGetValue(parcel.Id, out var meta);
            count += OpsExceptionRules.Detect(parcel, invoice, meta).Count;
        }

        return count;
    }

    internal static string ConditionLabel(ParcelOpsMetadata? meta) =>
        meta?.ConditionStatus switch
        {
            null or "" or "NOT_INSPECTED" => "Not inspected",
            "GOOD" => "Good",
            "MINOR_DAMAGE" => "Minor damage",
            "MAJOR_DAMAGE" => "Major damage",
            "OTHER" => "Other",
            _ => meta.ConditionStatus,
        };
}
