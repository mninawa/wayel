using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record QuoteCheckoutPaymentRecord(
    string Reference,
    UserId UserId,
    QuoteId QuoteId,
    int AmountMinorUnits,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public interface IQuoteCheckoutPaymentRepository
{
    Task<QuoteCheckoutPaymentRecord?> GetByReferenceAsync(string reference, CancellationToken cancellationToken = default);

    Task<QuoteCheckoutPaymentRecord?> GetPendingForQuoteAsync(QuoteId quoteId, CancellationToken cancellationToken = default);

    Task AddAsync(QuoteCheckoutPaymentRecord payment, CancellationToken cancellationToken = default);

    Task MarkCompletedAsync(string reference, DateTime completedAtUtc, CancellationToken cancellationToken = default);

    Task<QuoteCheckoutPaymentRecord?> GetCompletedForQuoteAsync(
        QuoteId quoteId,
        CancellationToken cancellationToken = default);
}
