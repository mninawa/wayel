using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Storage;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

internal static class QuotePaymentInvoiceCreator
{
    public static async Task<QuotePaymentInvoiceRecord?> EnsureAsync(
        Quote quote,
        User user,
        IReadOnlyList<Parcel> shipmentParcels,
        IReadOnlyList<QuoteParcel> links,
        BorderBoxPricingSettings config,
        IQuotePaymentInvoiceRepository invoices,
        IQuoteCheckoutPaymentRepository checkoutPayments,
        ISuiteSubscriptionRepository subscriptions,
        IInvoiceBlobStorage storage,
        CancellationToken cancellationToken)
    {
        if (quote.Status is not QuoteStatus.Paid and not QuoteStatus.ConvertedToShipment)
        {
            return null;
        }

        var existing = await invoices.GetByQuoteIdAsync(quote.Id, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var payment = await checkoutPayments.GetCompletedForQuoteAsync(quote.Id, cancellationToken);
        var paidAt = payment?.CompletedAtUtc ?? DateTime.UtcNow;
        var reference = payment?.Reference ?? "—";
        var amountZar = payment is null
            ? quote.TotalLandedCost
            : payment.AmountMinorUnits / 100m;

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var suiteNumber = subscription?.SuiteNumber;

        var pricing = QuotePricing.Compute(shipmentParcels, quote.DeliveryMethod, config);
        var breakdown = pricing.Breakdown
            .Select(b => new QuoteBreakdownLineDto(b.Label, b.Amount, b.IncludedInTotal))
            .ToList();

        var displayNumber = FormatDisplayNumber(quote.Id.Value);
        var invoiceNumber = $"INV-{quote.Id.Value.ToString("N")[..8].ToUpperInvariant()}";
        var storageKey = QuotePaymentInvoicePaths.BuildStorageKey(suiteNumber ?? "unknown-suite", quote.Id.Value);
        var fileName = QuotePaymentInvoicePaths.BuildFileName(displayNumber);

        var html = QuotePaymentInvoiceHtmlBuilder.Build(
            invoiceNumber,
            displayNumber,
            user,
            suiteNumber,
            paidAt,
            reference,
            amountZar,
            breakdown,
            quote.DeliveryMethod,
            shipmentParcels.Count);

        await using var stream = new MemoryStream(html);
        await storage.PutAsync(storageKey, stream, "text/html; charset=utf-8", cancellationToken);

        var record = new QuotePaymentInvoiceRecord(
            quote.Id,
            user.Id,
            invoiceNumber,
            reference,
            paidAt,
            amountZar,
            storageKey,
            fileName);

        await invoices.UpsertAsync(record, cancellationToken);
        return record;
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";
}
