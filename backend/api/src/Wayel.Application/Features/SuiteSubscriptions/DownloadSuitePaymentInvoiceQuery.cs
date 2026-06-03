using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Features.Quotes;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

/// <summary>
/// Download the HTML invoice for a single suite-access payment. We reuse the
/// quote-payment file DTO shape (FileName, ContentType, Stream) so both
/// endpoints stream content the same way and the API surface stays minimal.
/// </summary>
public sealed record DownloadSuitePaymentInvoiceQuery(string Reference) : IQuery<QuotePaymentInvoiceFileDto>;

internal sealed class DownloadSuitePaymentInvoiceQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ISuiteSubscriptionRepository subscriptions,
    ISuitePlanRepository plans) : IQueryHandler<DownloadSuitePaymentInvoiceQuery, QuotePaymentInvoiceFileDto>
{
    public async Task<Result<QuotePaymentInvoiceFileDto>> Handle(
        DownloadSuitePaymentInvoiceQuery request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        if (string.IsNullOrWhiteSpace(request.Reference))
        {
            return Error.Validation("suite_payment.invoice_reference_missing", "Payment reference is required.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        var payment = await checkoutPayments.GetByReferenceAsync(request.Reference.Trim(), cancellationToken);
        if (payment is null || payment.UserId != user.Id)
        {
            // Hide the existence of someone else's payment behind a NotFound.
            return Error.NotFound("suite_payment.invoice_not_found", "Suite payment invoice not found.");
        }

        if (!string.Equals(payment.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            return Error.NotFound(
                "suite_payment.invoice_unavailable",
                "Invoice is available once the suite-access payment has completed.");
        }

        // Resolve the plan label so the receipt shows the friendly name the
        // customer chose (Monthly / Quarterly / Annual) instead of a raw id.
        var planList = await plans.ListActiveAsync(cancellationToken);
        var plan = planList.FirstOrDefault(p => p.Id == payment.PlanId);
        var planName = plan is null
            ? "Suite Access subscription"
            : ResolvePlanLabel(plan.DurationMonths, plan.Name);
        var planMonths = plan?.DurationMonths ?? 0;

        // Use the live subscription window so the receipt's "access period"
        // line matches what the dashboard shows. Only attach the window if it
        // belongs to *this* payment — otherwise leave it blank rather than
        // suggesting the customer's current renewal covers an old payment.
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var paidAt = payment.CompletedAtUtc ?? payment.CreatedAtUtc;
        DateTime? subscriptionStart = null;
        DateTime? subscriptionEnd = null;
        if (subscription is { StartedAt: not null, ExpiresAt: not null }
            && Math.Abs((paidAt - subscription.StartedAt.Value).TotalDays) <= 1)
        {
            subscriptionStart = subscription.StartedAt;
            subscriptionEnd = subscription.ExpiresAt;
        }

        var invoiceNumber = SuitePaymentInvoiceNumbering.BuildInvoiceNumber(payment);
        var fileName = SuitePaymentInvoiceNumbering.BuildFileName(invoiceNumber);

        var html = SuitePaymentInvoiceHtmlBuilder.Build(
            invoiceNumber: invoiceNumber,
            user: user,
            suiteNumber: subscription?.SuiteNumber,
            paidAtUtc: paidAt,
            paymentReference: payment.Reference,
            paymentProvider: payment.Provider,
            planName: planName,
            planDurationMonths: planMonths,
            amountZar: Math.Round(payment.AmountMinorUnits / 100m, 2),
            subscriptionStartsAtUtc: subscriptionStart,
            subscriptionExpiresAtUtc: subscriptionEnd);

        // Suite invoices are tiny and trivially regenerable from the payment
        // record + plan + user — no need to round-trip through blob storage.
        // The stream owns the buffer; the endpoint streams + disposes it.
        Stream stream = new MemoryStream(html, writable: false);
        return new QuotePaymentInvoiceFileDto(fileName, "text/html; charset=utf-8", stream);
    }

    private static string ResolvePlanLabel(int durationMonths, string planName) =>
        string.IsNullOrWhiteSpace(planName) ? FallbackPlanLabel(durationMonths) : planName.Trim();

    private static string FallbackPlanLabel(int durationMonths)
    {
        if (durationMonths == 1) return "Monthly Suite Access";
        if (durationMonths == 3) return "Quarterly Suite Access";
        if (durationMonths == 12) return "Annual Suite Access";
        return "Suite Access";
    }
}
