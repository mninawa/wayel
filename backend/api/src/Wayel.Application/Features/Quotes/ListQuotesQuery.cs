using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Quotes;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Quotes;

public sealed record ListQuotesQuery(string? StatusFilter = null) : IQuery<IReadOnlyList<QuoteSummaryDto>>;

internal sealed class ListQuotesQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    IQuoteRepository quotes,
    IQuoteParcelRepository quoteParcels,
    IQuotePaymentInvoiceRepository paymentInvoices,
    ISuiteSubscriptionRepository subscriptions,
    IClock clock) : IQueryHandler<ListQuotesQuery, IReadOnlyList<QuoteSummaryDto>>
{
    public async Task<Result<IReadOnlyList<QuoteSummaryDto>>> Handle(
        ListQuotesQuery request,
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

        var items = await quotes.ListForUserAsync(user.Id, cancellationToken);
        var filtered = items.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(request.StatusFilter)
            && Enum.TryParse<QuoteStatus>(request.StatusFilter, true, out var status))
        {
            filtered = filtered.Where(q => q.Status == status);
        }

        var ordered = filtered.OrderByDescending(x => x.CreatedAtUtc).ToList();
        var invoiceByQuote = await paymentInvoices.ListByQuoteIdsAsync(
            ordered.Select(q => q.Id.Value).ToList(),
            cancellationToken);

        var summaries = new List<QuoteSummaryDto>();
        foreach (var q in ordered)
        {
            var links = await quoteParcels.ListForQuoteAsync(q.Id, cancellationToken);
            var count = links.Count;
            if (count == 0 && q.ShipmentId is not null)
            {
                count = 1;
            }

            var hasInvoice = QuoteStatusRules.HasPaymentInvoice(q.Status)
                || invoiceByQuote.ContainsKey(q.Id.Value);

            invoiceByQuote.TryGetValue(q.Id.Value, out var invoice);

            summaries.Add(new QuoteSummaryDto(
                q.Id.Value,
                FormatDisplayNumber(q.Id.Value),
                q.TotalLandedCost,
                q.Status.ToString(),
                QuoteStatusRules.ToDisplayLabel(q.Status),
                q.CreatedAtUtc,
                q.ValidUntil,
                count,
                q.DeliveryMethod,
                caps.ShipOutLocked && QuoteStatusRules.IsOpen(q.Status),
                hasInvoice,
                invoice?.PaidAtUtc,
                invoice?.PaymentReference));
        }

        return summaries;
    }

    private static string FormatDisplayNumber(Guid id) =>
        $"QUO-{id.ToString("N")[..8].ToUpperInvariant()}";
}
