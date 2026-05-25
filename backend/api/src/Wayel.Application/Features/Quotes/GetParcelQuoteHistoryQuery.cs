using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record GetParcelQuoteHistoryQuery(Guid ParcelId) : IQuery<IReadOnlyList<ParcelQuoteHistoryItemDto>>;

internal sealed class GetParcelQuoteHistoryQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IParcelRepository parcels,
    IQuoteParcelRepository quoteParcels,
    IQuoteRepository quotes) : IQueryHandler<GetParcelQuoteHistoryQuery, IReadOnlyList<ParcelQuoteHistoryItemDto>>
{
    public async Task<Result<IReadOnlyList<ParcelQuoteHistoryItemDto>>> Handle(
        GetParcelQuoteHistoryQuery request,
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

        var links = await quoteParcels.ListForParcelAsync(parcel.Id, cancellationToken);
        var history = new List<ParcelQuoteHistoryItemDto>();
        foreach (var link in links)
        {
            var quote = await quotes.GetByIdAsync(link.QuoteId, cancellationToken);
            if (quote is null || quote.UserId != user.Id)
            {
                continue;
            }

            history.Add(new ParcelQuoteHistoryItemDto(
                quote.Id.Value,
                FormatDisplayNumber(quote.Id.Value),
                QuoteStatusRules.ToDisplayLabel(quote.Status),
                quote.TotalLandedCost,
                quote.ValidUntil,
                QuoteStatusRules.IsOpen(quote.Status)));
        }

        return history.OrderByDescending(h => h.ValidUntil).ToList();
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";
}
