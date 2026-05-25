using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Configuration;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record CreateQuoteRequestCommand(
    IReadOnlyList<Guid> ParcelIds,
    string DeliveryMethod) : ICommand<CreateQuoteRequestResultDto>;

public sealed record CreateQuoteRequestResultDto(
    Guid QuoteId,
    string DisplayNumber,
    string Status,
    decimal TotalLandedCost,
    DateTime ValidUntil,
    int ParcelCount);

internal sealed class CreateQuoteRequestCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IUnitOfWork unitOfWork,
    IClock clock,
    IBorderBoxPricingConfigRepository pricingConfig,
    IOptions<BorderBoxPricingOptions> pricingOptions,
    IBorderBoxWhatsAppNotifier whatsApp) : ICommandHandler<CreateQuoteRequestCommand, CreateQuoteRequestResultDto>
{
    public async Task<Result<CreateQuoteRequestResultDto>> Handle(
        CreateQuoteRequestCommand request,
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

        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);

        var parcelIds = request.ParcelIds.Select(id => new ParcelId(id)).Distinct().ToList();
        if (parcelIds.Count == 0)
        {
            return Error.Validation("quote.parcels_required", "Select at least one parcel.");
        }

        var loaded = new List<Parcel>();
        var invoiceMap = await invoices.ListForUserAsync(user.Id, cancellationToken);

        foreach (var pid in parcelIds)
        {
            var parcel = await parcels.GetByIdAsync(pid, cancellationToken);
            if (parcel is null || parcel.UserId != user.Id)
            {
                return Error.Validation("quote.parcel_invalid", "One or more parcels are invalid.");
            }

            if (parcel.Status is ParcelStatus.InShipment or ParcelStatus.Delivered)
            {
                return Error.Validation(
                    "quote.parcel_unavailable",
                    $"{parcel.ItemName} is already in a shipment.");
            }

            if (!invoiceMap.ContainsKey(parcel.Id))
            {
                return Error.Validation(
                    "quote.invoice_required",
                    $"Upload an invoice for {parcel.ItemName} before requesting a quote.");
            }

            if (parcel.WeightKg is null or <= 0
                || string.IsNullOrWhiteSpace(parcel.DimensionsLabel)
                || parcel.DeclaredValueZar is null or <= 0
                || string.IsNullOrWhiteSpace(parcel.ItemName))
            {
                return Error.Validation(
                    "quote.parcel_incomplete",
                    $"Complete weight, dimensions and declared value for {parcel.ItemName}.");
            }

            var open = await quoteParcels.FindOpenQuoteForParcelAsync(parcel.Id, cancellationToken);
            if (open is not null && open.Id.Value != Guid.Empty)
            {
                return Error.Conflict(
                    "quote.parcel_open_quote",
                    $"{parcel.ItemName} is already on open quote {FormatDisplayNumber(open.Id.Value)}.");
            }

            loaded.Add(parcel);
        }

        var deliveryMethod = NormalizeDeliveryMethod(request.DeliveryMethod);
        var config = await BorderBoxPricingConfigLoader.LoadAsync(
            pricingConfig,
            pricingOptions,
            cancellationToken);
        var pricing = QuotePricing.Compute(loaded, deliveryMethod, config);
        var now = clock.UtcNow;

        var quote = Quote.CreateDraft(user.Id, pricing.TotalLandedCost, deliveryMethod, now);
        var publish = quote.Publish(now, caps.ShipOutLocked, caps.CustomerMessage);
        if (publish.IsFailure)
        {
            return publish.Error;
        }

        var links = loaded.Select(p =>
            QuoteParcel.Create(
                quote.Id,
                p.Id,
                p.DeclaredValueZar ?? 0m,
                p.WeightKg,
                p.DimensionsLabel)).ToList();

        await quotes.AddAsync(quote, cancellationToken);
        await quoteParcels.AddManyAsync(links, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var displayNumber = FormatDisplayNumber(quote.Id.Value);
        await whatsApp.NotifyQuoteReadyAsync(
            user,
            quote.Id.Value,
            displayNumber,
            quote.TotalLandedCost,
            quote.ValidUntil,
            cancellationToken);

        return new CreateQuoteRequestResultDto(
            quote.Id.Value,
            displayNumber,
            QuoteStatusRules.ToDisplayLabel(quote.Status),
            quote.TotalLandedCost,
            quote.ValidUntil,
            loaded.Count);
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";

    private static string NormalizeDeliveryMethod(string deliveryMethod) =>
        QuotePricing.NormalizeDeliveryMethod(deliveryMethod);
}
