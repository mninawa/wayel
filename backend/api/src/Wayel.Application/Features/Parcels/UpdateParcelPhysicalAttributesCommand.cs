using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record UpdateParcelPhysicalAttributesCommand(
    Guid ParcelId,
    decimal? WeightKg,
    string? DimensionsLabel,
    decimal? DeclaredValueZar) : ICommand<ParcelDetailDto>;

internal sealed class UpdateParcelPhysicalAttributesCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IParcelInvoiceRepository invoices,
    ISuiteSubscriptionRepository subscriptions,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<UpdateParcelPhysicalAttributesCommand, ParcelDetailDto>
{
    public async Task<Result<ParcelDetailDto>> Handle(
        UpdateParcelPhysicalAttributesCommand request,
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

        var parcel = await parcels.GetByIdAsync(new ParcelId(request.ParcelId), cancellationToken);
        if (parcel is null || parcel.UserId != user.Id)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var update = parcel.UpdatePhysicalAttributes(
            request.WeightKg,
            request.DimensionsLabel,
            request.DeclaredValueZar);
        if (update.IsFailure)
        {
            return update.Error;
        }

        await parcels.UpdateAsync(parcel, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var invoice = await invoices.GetForParcelAsync(parcel.Id, cancellationToken);
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);

        string? downloadUrl = invoice?.StorageKey is not null
            ? $"/api/v1/borderbox/parcels/{parcel.Id.Value}/invoice/download"
            : null;

        var displaySuite = subscription?.SuiteNumber;
        var resolver = new QuoteParcelStateResolver(quotes, quoteParcels, clock);
        var (state, openId, openDisplay) = await resolver.ResolveWithOpenQuoteAsync(parcel, cancellationToken);
        var shipmentId = await resolver.ResolveShipmentIdAsync(parcel, cancellationToken);
        return ParcelMapping.ToDetail(
            parcel,
            invoice,
            caps.CanUploadInvoices,
            clock.UtcNow,
            state.ToString(),
            ParcelQuoteStateRules.ToLabel(state),
            openId,
            openDisplay,
            shipmentId,
            downloadUrl,
            displaySuite);
    }
}
