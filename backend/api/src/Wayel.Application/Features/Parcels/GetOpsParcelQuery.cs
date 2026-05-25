using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;
using Wayel.Domain.Shipments;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record GetOpsParcelQuery(Guid ParcelId) : IQuery<OpsParcelDetailDto>;

internal sealed class GetOpsParcelQueryHandler(
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IParcelOpsMetadataRepository opsMetadata,
    IUserRepository users,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IShipmentRepository shipments,
    IClock clock) : IQueryHandler<GetOpsParcelQuery, OpsParcelDetailDto>
{
    public async Task<Result<OpsParcelDetailDto>> Handle(
        GetOpsParcelQuery request,
        CancellationToken cancellationToken)
    {
        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var user = await users.GetByIdAsync(parcel.UserId, cancellationToken);
        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
        var meta = await opsMetadata.GetForParcelAsync(parcel.Id, cancellationToken);
        var readiness = OpsReadinessRules.Evaluate(parcel, invoice, meta);
        var resolver = new QuoteParcelStateResolver(quotes, quoteParcels, clock);
        var (state, _, _) = await resolver.ResolveWithOpenQuoteAsync(parcel, cancellationToken);
        var shipmentId = await resolver.ResolveShipmentIdAsync(parcel, cancellationToken)
            ?? await FindShipmentIdForParcelAsync(parcel.UserId, parcel.Id, shipments, cancellationToken);

        return new OpsParcelDetailDto(
            parcel.Id.Value,
            OpsParcelDisplayIds.Format(parcel),
            user?.DisplayName ?? "Customer",
            user?.Email.Value ?? "—",
            user?.Phone,
            parcel.SuiteNumber,
            parcel.Retailer,
            parcel.TrackingNumber,
            parcel.ItemName,
            parcel.Category,
            parcel.Status.ToString(),
            OpsParcelLabels.Status(parcel.Status),
            parcel.WeightKg,
            parcel.DeclaredValueZar,
            parcel.DimensionsLabel,
            parcel.ReceivedAtUtc,
            Math.Max(0, (int)(clock.UtcNow.Date - parcel.ReceivedAtUtc.Date).TotalDays),
            OpsInvoiceStatus(invoice, parcel),
            invoice?.FileName,
            invoice?.UploadedAtUtc,
            state.ToString(),
            ParcelQuoteStateRules.ToLabel(state),
            shipmentId,
            readiness.State,
            readiness.BlockersSummary.Split(", ", StringSplitOptions.RemoveEmptyEntries).ToList(),
            meta is null ? null : new OpsInspectionDto(
                meta.ConditionStatus,
                meta.WarehouseLocation,
                meta.PackagingType,
                meta.OuterPackagingIntact,
                meta.SealIntact,
                meta.LabelReadable,
                meta.GoodsAsDescribed,
                meta.InspectionNotes,
                meta.InspectedAtUtc,
                meta.InspectedBy));
    }

    private static string OpsInvoiceStatus(ParcelInvoice? invoice, Parcel parcel)
    {
        if (invoice is null)
        {
            return "Awaiting Invoice";
        }

        return invoice.Status switch
        {
            InvoiceVerificationStatus.Verified => "Invoiced",
            InvoiceVerificationStatus.Rejected => "Rejected",
            _ => "Pending Review",
        };
    }

    private static async Task<Guid?> FindShipmentIdForParcelAsync(
        UserId userId,
        ParcelId parcelId,
        IShipmentRepository shipments,
        CancellationToken cancellationToken)
    {
        var all = await shipments.ListForUserAsync(userId, cancellationToken);
        var match = all
            .Where(s => s.ParcelIds.Contains(parcelId))
            .OrderByDescending(s => s.Status switch
            {
                ShipmentStatus.InTransit => 100,
                ShipmentStatus.Paid => 80,
                ShipmentStatus.AwaitingApproval => 60,
                ShipmentStatus.Quoted => 40,
                ShipmentStatus.Delivered => 30,
                _ => 0,
            })
            .FirstOrDefault();

        return match?.Id.Value;
    }
}
