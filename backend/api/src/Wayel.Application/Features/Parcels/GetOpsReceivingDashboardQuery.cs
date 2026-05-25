using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record GetOpsReceivingDashboardQuery(int Limit = 50) : IQuery<OpsReceivingDashboardDto>;

internal sealed class GetOpsReceivingDashboardQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IUserRepository users,
    IClock clock) : IQueryHandler<GetOpsReceivingDashboardQuery, OpsReceivingDashboardDto>
{
    public async Task<Result<OpsReceivingDashboardDto>> Handle(
        GetOpsReceivingDashboardQuery request,
        CancellationToken cancellationToken)
    {
        var items = await parcels.ListRecentAsync(request.Limit, cancellationToken);
        var today = clock.UtcNow.Date;
        var queue = new List<OpsParcelQueueItemDto>();

        var receivedToday = 0;
        var unmatched = 0;
        var awaitingInvoice = 0;
        var readyForQuote = 0;

        var invoicesByParcel = new Dictionary<ParcelId, ParcelInvoice?>();
        var metadataByParcel = new Dictionary<ParcelId, ParcelOpsMetadata?>();

        foreach (var parcel in items)
        {
            var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
            var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
            var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
            invoicesByParcel[parcel.Id] = invoice;
            metadataByParcel[parcel.Id] = meta;

            if (parcel.ReceivedAtUtc.Date == today)
            {
                receivedToday++;
            }

            var suiteMatch = ResolveSuiteMatch(parcel);
            if (suiteMatch == "No Match")
            {
                unmatched++;
            }

            var invoiceStatus = OpsInvoiceStatusLabel(parcel, invoice);
            if (invoiceStatus is "Awaiting Invoice" or "Pending Review")
            {
                awaitingInvoice++;
            }

            if (parcel.Status == ParcelStatus.ReadyToShip)
            {
                readyForQuote++;
            }

            queue.Add(new OpsParcelQueueItemDto(
                parcel.Id.Value,
                OpsParcelDisplayIds.Format(parcel),
                parcel.TrackingNumber,
                parcel.Retailer,
                parcel.ItemName,
                user?.DisplayName ?? "Customer",
                user?.Email.Value ?? "—",
                parcel.SuiteNumber,
                suiteMatch,
                invoiceStatus,
                OpsReceivingAggregation.ConditionLabel(meta),
                parcel.Status.ToString(),
                OpsParcelLabels.Status(parcel.Status),
                parcel.ReceivedAtUtc));
        }

        var exceptionCount = OpsReceivingAggregation.CountExceptions(items, invoicesByParcel, metadataByParcel);

        var stats = new OpsReceivingStatsDto(
            receivedToday,
            unmatched,
            awaitingInvoice,
            readyForQuote,
            exceptionCount);

        return new OpsReceivingDashboardDto(stats, queue);
    }

    private static string ResolveSuiteMatch(Parcel parcel)
    {
        if (string.IsNullOrWhiteSpace(parcel.SuiteNumber))
        {
            return "No Match";
        }

        if (string.IsNullOrWhiteSpace(parcel.TrackingNumber))
        {
            return "Partial Match";
        }

        return "Match";
    }

    private static string OpsInvoiceStatusLabel(Parcel parcel, ParcelInvoice? invoice)
    {
        if (invoice is null)
        {
            return parcel.Status == ParcelStatus.AwaitingInvoice ? "Awaiting Invoice" : "Awaiting Invoice";
        }

        return invoice.Status switch
        {
            InvoiceVerificationStatus.Verified => "Invoiced",
            InvoiceVerificationStatus.Rejected => "Rejected",
            _ => "Pending Review",
        };
    }
}

internal static class OpsParcelDisplayIds
{
    internal static string Format(Parcel parcel) =>
        $"PRC-{parcel.ReceivedAtUtc:yyyy}-{parcel.Id.Value.ToString()[..5].ToUpperInvariant()}";
}

internal static class OpsParcelLabels
{
    internal static string Status(ParcelStatus status) =>
        status switch
        {
            ParcelStatus.Received => "Received",
            ParcelStatus.AwaitingInvoice => "Awaiting Invoice",
            ParcelStatus.ReadyToShip => "Ready for Quote",
            ParcelStatus.InShipment => "In Shipment",
            ParcelStatus.Delivered => "Delivered",
            _ => status.ToString(),
        };
}
