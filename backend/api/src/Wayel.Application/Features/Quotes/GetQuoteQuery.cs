using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record GetQuoteQuery(Guid QuoteId) : IQuery<QuoteDetailDto>;

internal sealed class GetQuoteQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IParcelRepository parcels,
    IQuotePaymentInvoiceRepository paymentInvoices,
    ISuiteSubscriptionRepository subscriptions,
    IClock clock,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions) : IQueryHandler<GetQuoteQuery, QuoteDetailDto>
{
    public async Task<Result<QuoteDetailDto>> Handle(GetQuoteQuery request, CancellationToken cancellationToken)
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

        if (shipmentParcels.Count == 0 && quote.ShipmentId is { } legacyShipmentId)
        {
            var legacyShipment = await parcels.ListForUserAsync(user.Id, cancellationToken);
            shipmentParcels = legacyShipment
                .Where(p => p.Status is ParcelStatus.InShipment or ParcelStatus.ReadyToShip)
                .Take(6)
                .ToList();
        }

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        var config = await BorderBoxPricingConfigLoader.LoadAsync(
            pricingConfig,
            pricingOptions,
            cancellationToken);
        var invoice = await paymentInvoices.GetByQuoteIdAsync(quote.Id, cancellationToken);
        var hasPaymentInvoice = QuoteStatusRules.HasPaymentInvoice(quote.Status) || invoice is not null;
        return Map(quote, shipmentParcels, links, caps.ShipOutLocked, clock.UtcNow, config, hasPaymentInvoice);
    }

    internal static QuoteDetailDto Map(
        Quote quote,
        IReadOnlyList<Parcel> shipmentParcels,
        IReadOnlyList<QuoteParcel> links,
        bool shipOutLocked,
        DateTime nowUtc,
        BorderBoxPricingSettings config,
        bool hasPaymentInvoice)
    {
        var pricing = QuotePricing.Compute(shipmentParcels, quote.DeliveryMethod, config);
        var expired = nowUtc > quote.ValidUntil;
        var canApprove = !shipOutLocked
            && !expired
            && quote.Status == QuoteStatus.ReadyForReview;
        var canPay = !shipOutLocked
            && !expired
            && quote.ShipmentId is null
            && quote.Status is QuoteStatus.Approved or QuoteStatus.PaymentPending;
        var canCancel = !expired
            && quote.Status is QuoteStatus.ReadyForReview
                or QuoteStatus.Approved
                or QuoteStatus.PaymentPending
                or QuoteStatus.BlockedSuiteExpired;

        var linkedDtos = shipmentParcels.Select(p =>
        {
            var link = links.FirstOrDefault(l => l.ParcelId == p.Id);
            return new QuoteLinkedParcelDto(
                p.Id.Value,
                FormatParcelReference(p.Id.Value),
                p.ItemName,
                p.Retailer,
                link?.DeclaredValueZar ?? p.DeclaredValueZar ?? 0m,
                link?.WeightKg ?? p.WeightKg,
                link?.DimensionsLabel ?? p.DimensionsLabel);
        }).ToList();

        return new QuoteDetailDto(
            quote.Id.Value,
            FormatDisplayNumber(quote.Id.Value),
            quote.ShipmentId?.Value,
            quote.CreatedAtUtc,
            quote.PublishedAtUtc,
            quote.ValidUntil,
            "Eswatini",
            QuotePricing.DeliveryEstimate(quote.DeliveryMethod),
            pricing.TotalLandedCost,
            pricing.DeclaredGoodsValueZar,
            pricing.VatCharged,
            pricing.DutyCharged,
            config.DutyGoodsValueThresholdZar,
            shipmentParcels.Count,
            shipmentParcels.Sum(p => p.WeightKg ?? 0m),
            quote.DeliveryMethod,
            shipmentParcels.Count > 1 ? "Yes" : "No",
            WeYellHubAddress.CityProvince,
            quote.Status.ToString(),
            QuoteStatusRules.ToDisplayLabel(quote.Status),
            quote.StatusReason,
            shipOutLocked,
            canApprove,
            canPay,
            canCancel,
            hasPaymentInvoice,
            pricing.Breakdown,
            linkedDtos);
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";

    private static string FormatParcelReference(Guid parcelId) =>
        $"BBSA-{parcelId.ToString("N")[..8].ToUpperInvariant()}";
}
