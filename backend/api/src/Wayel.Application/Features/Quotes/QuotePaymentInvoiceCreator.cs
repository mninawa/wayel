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
            // Self-heal: if the Mongo record points at a storage key that's
            // no longer present (e.g. a redeployed container wiped the local
            // blob cache, an S3 lifecycle policy expired the object, etc.),
            // rebuild the HTML deterministically and re-PUT it under the same
            // key. The record is unchanged so links the customer already has
            // keep working.
            var blobPresent = !string.IsNullOrWhiteSpace(existing.StorageKey)
                && await storage.ExistsAsync(existing.StorageKey, cancellationToken: cancellationToken);
            if (blobPresent)
            {
                return existing;
            }

            await RebuildBlobAsync(
                existing,
                quote,
                user,
                shipmentParcels,
                config,
                checkoutPayments,
                subscriptions,
                storage,
                cancellationToken);
            return existing;
        }

        var payment = await checkoutPayments.GetCompletedForQuoteAsync(quote.Id, cancellationToken);
        var paidAt = payment?.CompletedAtUtc ?? DateTime.UtcNow;
        var reference = payment?.Reference ?? "—";
        var provider = payment?.Provider ?? "paystack";
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
            provider,
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
            fileName,
            provider);

        await invoices.UpsertAsync(record, cancellationToken);
        return record;
    }

    /// <summary>
    /// Recreate just the blob (not the Mongo record) for an existing invoice.
    /// Uses the recorded reference, amount, and paid-at so the regenerated
    /// document is identical to what the customer saw the first time.
    /// </summary>
    private static async Task RebuildBlobAsync(
        QuotePaymentInvoiceRecord record,
        Quote quote,
        User user,
        IReadOnlyList<Parcel> shipmentParcels,
        BorderBoxPricingSettings config,
        IQuoteCheckoutPaymentRepository checkoutPayments,
        ISuiteSubscriptionRepository subscriptions,
        IInvoiceBlobStorage storage,
        CancellationToken cancellationToken)
    {
        // Prefer values stored on the record (these are the source of truth
        // for what was actually charged) but fall back to the latest payment
        // / quote totals if any of them are missing.
        var payment = await checkoutPayments.GetCompletedForQuoteAsync(quote.Id, cancellationToken);
        var paidAt = record.PaidAtUtc != default ? record.PaidAtUtc : payment?.CompletedAtUtc ?? DateTime.UtcNow;
        var reference = !string.IsNullOrWhiteSpace(record.PaymentReference)
            ? record.PaymentReference
            : payment?.Reference ?? "—";
        var provider = !string.IsNullOrWhiteSpace(record.PaymentProvider)
            ? record.PaymentProvider
            : payment?.Provider ?? "paystack";
        var amountZar = record.AmountZar > 0
            ? record.AmountZar
            : payment is null ? quote.TotalLandedCost : payment.AmountMinorUnits / 100m;

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var suiteNumber = subscription?.SuiteNumber;

        var pricing = QuotePricing.Compute(shipmentParcels, quote.DeliveryMethod, config);
        var breakdown = pricing.Breakdown
            .Select(b => new QuoteBreakdownLineDto(b.Label, b.Amount, b.IncludedInTotal))
            .ToList();

        var displayNumber = FormatDisplayNumber(quote.Id.Value);
        var html = QuotePaymentInvoiceHtmlBuilder.Build(
            record.InvoiceNumber,
            displayNumber,
            user,
            suiteNumber,
            paidAt,
            reference,
            provider,
            amountZar,
            breakdown,
            quote.DeliveryMethod,
            shipmentParcels.Count);

        await using var stream = new MemoryStream(html);
        await storage.PutAsync(record.StorageKey, stream, "text/html; charset=utf-8", cancellationToken);
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";
}
