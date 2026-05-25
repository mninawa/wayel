using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Storage;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;
using Wayel.Application.Features.Warehouse;
using Wayel.Application.Features.Tracking;

namespace Wayel.Application.Features.Quotes;

public sealed record CompleteQuoteCheckoutCommand(string Reference) : ICommand<QuoteDto>;

internal sealed class CompleteQuoteCheckoutCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IParcelRepository parcels,
    IShipmentRepository shipments,
    IQuoteCheckoutPaymentRepository checkoutPayments,
    IQuotePaymentInvoiceRepository paymentInvoices,
    ISuiteSubscriptionRepository subscriptions,
    ICustomerAddressRepository addresses,
    IInvoiceBlobStorage invoiceStorage,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions,
    IPaymentGateway paymentGateway,
    IUnitOfWork unitOfWork,
    IClock clock,
    IBorderBoxWhatsAppNotifier whatsApp,
    ShipmentTrackingEventWriter trackingEvents,
    IParcelOpsMetadataRepository opsMetadata,
    IPickTaskRepository pickTasks,
    IPackingTaskRepository packingTasks) : ICommandHandler<CompleteQuoteCheckoutCommand, QuoteDto>
{
    public async Task<Result<QuoteDto>> Handle(
        CompleteQuoteCheckoutCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var reference = (request.Reference ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(reference))
        {
            return Error.Validation("checkout.missing_reference", "Payment reference is required.");
        }

        if (!paymentGateway.IsConfigured)
        {
            return Error.Validation(
                "payment_gateway.misconfigured",
                "Paystack is not configured.");
        }

        var payment = await checkoutPayments.GetByReferenceAsync(reference, cancellationToken);
        if (payment is null)
        {
            return Error.NotFound("checkout.not_found", "Checkout session not found.");
        }

        if (payment.UserId != current.UserId)
        {
            return Error.Forbidden("checkout.forbidden", "This payment belongs to another account.");
        }

        var quote = await quotes.GetByIdAsync(payment.QuoteId, cancellationToken);
        if (quote is null)
        {
            return Error.NotFound("quote.not_found", "Quote not found.");
        }

        if (quote.Status is QuoteStatus.ConvertedToShipment && quote.ShipmentId is not null)
        {
            return MapQuote(quote);
        }

        if (string.Equals(payment.Status, "Completed", StringComparison.OrdinalIgnoreCase)
            && quote.Status is QuoteStatus.Paid or QuoteStatus.ConvertedToShipment)
        {
            return MapQuote(quote);
        }

        PaymentVerifyResult verified;
        try
        {
            verified = await paymentGateway.VerifyChargeAsync(reference, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return Error.Validation("checkout.verify_failed", ex.Message);
        }

        if (!string.Equals(verified.Status, "success", StringComparison.OrdinalIgnoreCase))
        {
            return Error.Validation(
                "checkout.payment_declined",
                "Payment was not successful. Try again or use another card.");
        }

        if (verified.AmountMinorUnits > 0
            && verified.AmountMinorUnits != payment.AmountMinorUnits)
        {
            return Error.Validation(
                "checkout.amount_mismatch",
                "Paid amount does not match the quote total.");
        }

        var user = await users.GetByIdAsync(payment.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(payment.UserId);
        }

        if (clock.UtcNow > quote.ValidUntil)
        {
            quote.Cancel();
            await quotes.UpdateAsync(quote, cancellationToken);
            return Error.Validation("quote.expired", "This quote expired before payment completed.");
        }

        if (quote.Status is not QuoteStatus.PaymentPending and not QuoteStatus.Approved)
        {
            return Error.Validation("quote.invalid_state", "This quote is not awaiting payment.");
        }

        if (quote.Status == QuoteStatus.Approved)
        {
            var begin = quote.BeginPayment(clock.UtcNow);
            if (begin.IsFailure)
            {
                return begin.Error;
            }
        }

        var shipmentResult = await QuoteShipmentCreator.CreateFromQuoteAsync(
            quote,
            user,
            quoteParcels,
            parcels,
            shipments,
            cancellationToken);

        if (shipmentResult.IsFailure)
        {
            return Result.Failure<QuoteDto>(shipmentResult.Error);
        }

        var shipment = await shipments.GetByIdAsync(shipmentResult.Value, cancellationToken);
        if (shipment is not null)
        {
            shipment.MarkPaid();
            await shipments.UpdateAsync(shipment, cancellationToken);
        }

        quote.MarkPaid();
        quote.MarkConvertedToShipment();

        await quotes.UpdateAsync(quote, cancellationToken);
        await checkoutPayments.MarkCompletedAsync(reference, clock.UtcNow, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

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

        if (shipment is not null)
        {
            var destination = await ResolveDestinationAsync(user.Id, addresses, cancellationToken);
            await trackingEvents.RecordCheckoutCompletedAsync(
                shipment,
                shipmentParcels,
                destination,
                cancellationToken);

            await WarehouseTaskCreator.CreateForPaidShipmentAsync(
                shipment,
                user,
                parcels,
                opsMetadata,
                pickTasks,
                packingTasks,
                clock,
                cancellationToken);
        }

        await QuotePaymentInvoiceCreator.EnsureAsync(
            quote,
            user,
            shipmentParcels,
            links,
            config,
            paymentInvoices,
            checkoutPayments,
            subscriptions,
            invoiceStorage,
            cancellationToken);

        await whatsApp.NotifyQuotePaidAsync(
            user,
            $"QUO-{quote.Id.Value.ToString("N")[..8].ToUpperInvariant()}",
            quote.TotalLandedCost,
            cancellationToken);

        return MapQuote(quote);
    }

    private static async Task<string> ResolveDestinationAsync(
        UserId userId,
        ICustomerAddressRepository addresses,
        CancellationToken cancellationToken)
    {
        var all = await addresses.ListForUserAsync(userId, cancellationToken);
        var delivery = all.FirstOrDefault(a => a.IsDefault && !a.IsSuiteAddress)
            ?? all.FirstOrDefault(a => !a.IsSuiteAddress);

        if (delivery is null || string.IsNullOrWhiteSpace(delivery.City))
        {
            return "Eswatini";
        }

        return $"{delivery.City}, Eswatini";
    }

    private static QuoteDto MapQuote(Quote quote) =>
        new(
            quote.Id.Value,
            quote.ShipmentId?.Value,
            quote.TotalLandedCost,
            QuoteStatusRules.ToDisplayLabel(quote.Status),
            quote.StatusReason);
}
