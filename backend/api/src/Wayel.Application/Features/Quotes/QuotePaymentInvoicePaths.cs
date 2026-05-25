using Wayel.Application.Features.Parcels;

namespace Wayel.Application.Features.Quotes;

public static class QuotePaymentInvoicePaths
{
    public static string BuildStorageKey(string suiteNumber, Guid quoteId) =>
        $"{ParcelInvoiceStoragePaths.SanitizeSuiteFolder(suiteNumber)}/payment-invoices/{quoteId:D}/invoice.html";

    public static string BuildFileName(string displayNumber) =>
        $"WeYell-Payment-{displayNumber}.html";
}
