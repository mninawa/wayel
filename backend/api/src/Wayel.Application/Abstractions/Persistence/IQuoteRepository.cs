using Wayel.Domain.Quotes;

namespace Wayel.Application.Abstractions.Persistence;

public interface IQuoteRepository
{
    Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default);
    Task AddAsync(Quote quote, CancellationToken cancellationToken = default);
    Task UpdateAsync(Quote quote, CancellationToken cancellationToken = default);
}
