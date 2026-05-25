using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Payments;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.SuiteSubscriptions;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record InitiateQuoteCheckoutCommand(Guid QuoteId, string CallbackUrl)
    : ICommand<InitiateQuoteCheckoutResult>;

public sealed record InitiateQuoteCheckoutResult(
    string Reference,
    string AuthorizationUrl,
    string AccessCode,
    decimal AmountZar,
    string Provider,
    string? PublicKey);

internal sealed class InitiateQuoteCheckoutCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IParcelRepository parcels,
    IQuoteCheckoutPaymentRepository checkoutPayments,
    IPaymentGateway paymentGateway,
    IUnitOfWork unitOfWork,
    IClock clock,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions) : ICommandHandler<InitiateQuoteCheckoutCommand, InitiateQuoteCheckoutResult>
{
    public async Task<Result<InitiateQuoteCheckoutResult>> Handle(
        InitiateQuoteCheckoutCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        if (!paymentGateway.IsConfigured)
        {
            return Error.Validation(
                "payment_gateway.misconfigured",
                "Paystack is not configured. Set Billing:Paystack:SecretKey.");
        }

        var callbackUrl = (request.CallbackUrl ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(callbackUrl) || !Uri.TryCreate(callbackUrl, UriKind.Absolute, out _))
        {
            return Error.Validation("checkout.invalid_callback", "A valid callback URL is required.");
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

        if (quote.ShipmentId is not null)
        {
            return Error.Validation("quote.already_paid", "This quote has already been paid and converted.");
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        if (caps.ShipOutLocked)
        {
            return Error.Forbidden(
                "suite.ship_out_locked",
                caps.CustomerMessage ?? "Renew suite access before paying for ship-out.");
        }

        var begin = quote.BeginPayment(clock.UtcNow);
        if (begin.IsFailure)
        {
            return begin.Error;
        }

        var links = await quoteParcels.ListForQuoteAsync(quote.Id, cancellationToken);
        var loaded = new List<Parcel>();
        foreach (var link in links)
        {
            var parcel = await parcels.GetByIdAsync(link.ParcelId, cancellationToken);
            if (parcel is not null)
            {
                loaded.Add(parcel);
            }
        }

        var config = await BorderBoxPricingConfigLoader.LoadAsync(
            pricingConfig,
            pricingOptions,
            cancellationToken);
        var pricing = QuotePricing.Compute(loaded, quote.DeliveryMethod, config);
        var amountMinor = InitiateSuiteCheckoutCommandHandler.ToMinorUnits(pricing.TotalLandedCost);

        var pending = await checkoutPayments.GetPendingForQuoteAsync(quote.Id, cancellationToken);
        var attemptCount = pending is null ? 0 : 1;
        var reference = QuoteCheckoutBilling.BuildPaystackReference(quote.Id, attemptCount);

        var init = await paymentGateway.InitializeChargeAsync(
            new PaymentInitializeRequest(
                user.Email.Value,
                reference,
                amountMinor,
                callbackUrl,
                new Dictionary<string, string>
                {
                    ["user_id"] = user.Id.Value.ToString(),
                    ["quote_id"] = quote.Id.Value.ToString(),
                    ["payment_type"] = "shipping",
                }),
            cancellationToken);

        await checkoutPayments.AddAsync(
            new QuoteCheckoutPaymentRecord(
                init.Reference,
                user.Id,
                quote.Id,
                amountMinor,
                "Pending",
                clock.UtcNow,
                null),
            cancellationToken);

        await quotes.UpdateAsync(quote, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return new InitiateQuoteCheckoutResult(
            init.Reference,
            init.AuthorizationUrl,
            init.AccessCode,
            pricing.TotalLandedCost,
            "Paystack",
            paymentGateway.PublicKey);
    }
}
