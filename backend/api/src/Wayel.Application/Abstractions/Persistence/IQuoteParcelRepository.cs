using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface IQuoteParcelRepository
{
    Task<IReadOnlyList<QuoteParcel>> ListForQuoteAsync(QuoteId quoteId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<QuoteParcel>> ListForParcelAsync(ParcelId parcelId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<QuoteParcel>> ListForUserParcelsAsync(
        UserId userId,
        IEnumerable<ParcelId> parcelIds,
        CancellationToken cancellationToken = default);

    Task<Quote?> FindOpenQuoteForParcelAsync(ParcelId parcelId, CancellationToken cancellationToken = default);

    Task AddAsync(QuoteParcel link, CancellationToken cancellationToken = default);

    Task AddManyAsync(IEnumerable<QuoteParcel> links, CancellationToken cancellationToken = default);
}
