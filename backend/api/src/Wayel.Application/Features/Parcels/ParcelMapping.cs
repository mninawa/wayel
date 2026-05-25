using Wayel.Domain.ParcelInvoices;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

internal static class ParcelMapping
{
    internal static ParcelListItemDto ToListItem(
        Parcel parcel,
        ParcelInvoice? invoice,
        string quoteState,
        string quoteStateLabel,
        Guid? openQuoteId,
        string? openQuoteDisplayNumber,
        bool canRequestQuote,
        string? quoteRequestBlocker,
        Guid? shipmentId = null,
        string? invoiceDownloadUrl = null) =>
        new(
            parcel.Id.Value,
            parcel.Retailer,
            parcel.TrackingNumber,
            parcel.ItemName,
            parcel.Category,
            parcel.Status.ToString(),
            parcel.WeightKg,
            parcel.DeclaredValueZar,
            parcel.DimensionsLabel,
            parcel.ReceivedAtUtc,
            InvoiceStatusLabel(invoice),
            invoice?.FileName,
            invoice?.UploadedAtUtc,
            quoteState,
            quoteStateLabel,
            openQuoteId,
            openQuoteDisplayNumber,
            shipmentId,
            canRequestQuote,
            quoteRequestBlocker);

    internal static ParcelDetailDto ToDetail(
        Parcel parcel,
        ParcelInvoice? invoice,
        bool canUploadInvoice,
        DateTime nowUtc,
        string quoteState,
        string quoteStateLabel,
        Guid? openQuoteId,
        string? openQuoteDisplayNumber,
        Guid? shipmentId = null,
        string? invoiceDownloadUrl = null,
        string? suiteNumberOverride = null) =>
        new(
            parcel.Id.Value,
            string.IsNullOrWhiteSpace(suiteNumberOverride) ? parcel.SuiteNumber : suiteNumberOverride.Trim(),
            parcel.Retailer,
            parcel.TrackingNumber,
            parcel.ItemName,
            parcel.Category,
            parcel.Status.ToString(),
            parcel.WeightKg,
            parcel.DeclaredValueZar,
            parcel.DimensionsLabel,
            parcel.ReceivedAtUtc,
            Math.Max(0, (int)(nowUtc.Date - parcel.ReceivedAtUtc.Date).TotalDays),
            InvoiceStatusLabel(invoice),
            invoice?.FileName,
            invoice?.FileSizeBytes,
            invoice?.UploadedAtUtc,
            canUploadInvoice,
            invoiceDownloadUrl,
            Array.Empty<ParcelPhotoDto>(),
            quoteState,
            quoteStateLabel,
            openQuoteId,
            openQuoteDisplayNumber,
            shipmentId);

    private static string InvoiceStatusLabel(ParcelInvoice? invoice) =>
        invoice is null ? "Pending" : "Uploaded";
}
