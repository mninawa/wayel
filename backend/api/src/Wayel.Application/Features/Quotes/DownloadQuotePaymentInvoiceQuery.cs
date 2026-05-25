using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record DownloadQuotePaymentInvoiceQuery(Guid QuoteId) : IQuery<QuotePaymentInvoiceFileDto>;

internal sealed class DownloadQuotePaymentInvoiceQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IParcelRepository parcels,
    IQuotePaymentInvoiceRepository invoices,
    IQuoteCheckoutPaymentRepository checkoutPayments,
    ISuiteSubscriptionRepository subscriptions,
    IInvoiceBlobStorage storage,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions) : IQueryHandler<DownloadQuotePaymentInvoiceQuery, QuotePaymentInvoiceFileDto>
{
    public async Task<Result<QuotePaymentInvoiceFileDto>> Handle(
        DownloadQuotePaymentInvoiceQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var quote = await quotes.GetByIdAsync(new QuoteId(request.QuoteId), cancellationToken);
        if (quote is null || quote.UserId != user.Id)
        {
            return Error.NotFound("quote.not_found", "Quote not found.");
        }

        if (quote.Status is not QuoteStatus.Paid and not QuoteStatus.ConvertedToShipment)
        {
            return Error.NotFound(
                "quote.invoice_unavailable",
                "Payment invoice is available after Paystack payment.");
        }

        var config = await BorderBoxPricingConfigLoader.LoadAsync(
            pricingConfig,
            pricingOptions,
            cancellationToken);
        var links = await quoteParcels.ListForQuoteAsync(quote.Id, cancellationToken);
        var shipmentParcels = new List<Parcel>();
        foreach (var link in links)
        {
            var p = await parcels.GetByIdAsync(link.ParcelId, cancellationToken);
            if (p is not null)
            {
                shipmentParcels.Add(p);
            }
        }

        var record = await QuotePaymentInvoiceCreator.EnsureAsync(
            quote,
            user,
            shipmentParcels,
            links,
            config,
            invoices,
            checkoutPayments,
            subscriptions,
            storage,
            cancellationToken);

        if (record is null || string.IsNullOrWhiteSpace(record.StorageKey))
        {
            return Error.NotFound("quote.invoice_missing", "Payment invoice could not be generated.");
        }

        var stream = await storage.OpenReadAsync(record.StorageKey, cancellationToken);
        if (stream is null)
        {
            return Error.NotFound("quote.invoice_file_missing", "Payment invoice file is not available.");
        }

        return new QuotePaymentInvoiceFileDto(
            record.FileName,
            "text/html; charset=utf-8",
            stream);
    }
}
