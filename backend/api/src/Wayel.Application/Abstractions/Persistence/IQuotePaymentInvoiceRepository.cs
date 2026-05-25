using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record QuotePaymentInvoiceRecord(
    QuoteId QuoteId,
    UserId UserId,
    string InvoiceNumber,
    string PaymentReference,
    DateTime PaidAtUtc,
    decimal AmountZar,
    string StorageKey,
    string FileName,
    string PaymentProvider = "paystack");

public interface IQuotePaymentInvoiceRepository
{
    Task<QuotePaymentInvoiceRecord?> GetByQuoteIdAsync(QuoteId quoteId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, QuotePaymentInvoiceRecord>> ListByQuoteIdsAsync(
        IReadOnlyCollection<Guid> quoteIds,
        CancellationToken cancellationToken = default);

    Task UpsertAsync(QuotePaymentInvoiceRecord invoice, CancellationToken cancellationToken = default);
}
