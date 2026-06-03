using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.PaymentMethods;
using Wayel.Domain.Common;
using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record GetSuitePaymentsOverviewQuery : IQuery<SuitePaymentsOverviewDto>;

public sealed record SuitePaymentsOverviewDto(
    SuitePaymentsCurrentPlanDto? CurrentPlan,
    SuitePaymentsSubscriptionDto? Subscription,
    SuitePaymentsLastPaymentDto? LastPayment,
    SuitePaymentsNextPaymentDto? NextPayment,
    SuitePaymentMethodDto? PaymentMethod,
    IReadOnlyList<SuitePaymentMethodDto> PaymentMethods,
    IReadOnlyList<SuitePaymentHistoryRowDto> History,
    SuitePaymentsSummaryDto Summary);

public sealed record SuitePaymentsCurrentPlanDto(
    Guid PlanId,
    string PlanName,
    string PlanLabel,
    int DurationMonths,
    decimal PriceZar);

public sealed record SuitePaymentsSubscriptionDto(
    string SuiteNumber,
    string Status,
    DateTime? StartedAtUtc,
    DateTime? ExpiresAtUtc,
    int? DaysRemaining,
    bool ShipOutLocked,
    bool AutoRenewEnabled);

public sealed record SuitePaymentsLastPaymentDto(
    string Reference,
    DateTime PaidAtUtc,
    decimal AmountZar,
    string Status);

public sealed record SuitePaymentsNextPaymentDto(
    DateTime DueAtUtc,
    decimal AmountZar,
    int DaysRemaining);

public sealed record SuitePaymentMethodDto(
    Guid Id,
    string Provider,
    string Descriptor,
    string CardType,
    string Last4,
    string ExpMonth,
    string ExpYear,
    string? Label,
    bool IsDefault);

public sealed record SuitePaymentHistoryRowDto(
    string Reference,
    string InvoiceNumber,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc,
    string PlanName,
    int PlanDurationMonths,
    decimal AmountZar,
    string Status);

public sealed record SuitePaymentsSummaryDto(
    int TotalInvoices,
    int Paid,
    int Failed,
    decimal TotalPaidZar);

internal sealed class GetSuitePaymentsOverviewQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    ISuiteCheckoutPaymentRepository checkoutPayments,
    ICustomerSavedCardRepository savedCards,
    ISuitePlanRepository plans,
    IClock clock) : IQueryHandler<GetSuitePaymentsOverviewQuery, SuitePaymentsOverviewDto>
{
    public async Task<Result<SuitePaymentsOverviewDto>> Handle(
        GetSuitePaymentsOverviewQuery request,
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

        return await SuitePaymentsOverviewProjector
            .BuildAsync(user, subscriptions, checkoutPayments, savedCards, plans, clock, cancellationToken);
    }
}

/// <summary>
/// Shared projection used by the customer-facing payments dashboard and
/// the ops-side <c>/platform-ops/customers/{id}/suite-payments</c>
/// endpoint. Keeping it in one place ensures both surfaces stay in sync
/// when the schema or invoice numbering rules change.
/// </summary>
internal static class SuitePaymentsOverviewProjector
{
    public static async Task<SuitePaymentsOverviewDto> BuildAsync(
        User user,
        ISuiteSubscriptionRepository subscriptions,
        ISuiteCheckoutPaymentRepository checkoutPayments,
        ICustomerSavedCardRepository savedCards,
        ISuitePlanRepository plans,
        IClock clock,
        CancellationToken cancellationToken)
    {
        var subscription = await subscriptions.GetForUserAsync(user.Id, cancellationToken);
        var payments = await checkoutPayments.ListForUserAsync(user.Id, cancellationToken);
        var planList = await plans.ListActiveAsync(cancellationToken);
        var plansById = planList.ToDictionary(p => p.Id.Value, p => p);

        var now = clock.UtcNow;
        var currentPlan = BuildCurrentPlan(subscription, payments, plansById, planList);
        var subscriptionDto = BuildSubscription(subscription, now);

        var lastCompleted = payments
            .Where(p => string.Equals(p.Status, "Completed", StringComparison.OrdinalIgnoreCase)
                && p.CompletedAtUtc.HasValue)
            .OrderByDescending(p => p.CompletedAtUtc!.Value)
            .FirstOrDefault();

        SuitePaymentsLastPaymentDto? lastPaymentDto = lastCompleted is null
            ? null
            : new SuitePaymentsLastPaymentDto(
                lastCompleted.Reference,
                lastCompleted.CompletedAtUtc!.Value,
                MinorToMajor(lastCompleted.AmountMinorUnits),
                "Successful");

        var nextPaymentDto = BuildNextPayment(subscription, currentPlan, now);

        var cardRecords = await savedCards.ListActiveForUserAsync(user.Id, cancellationToken);
        var paymentMethods = cardRecords.Select(MapSavedCard).ToList();
        var paymentMethodDto = paymentMethods.FirstOrDefault(x => x.IsDefault)
            ?? paymentMethods.FirstOrDefault();

        var history = payments
            .Select(p => MapHistoryRow(p, plansById))
            .ToList();

        var paidCount = payments.Count(p =>
            string.Equals(p.Status, "Completed", StringComparison.OrdinalIgnoreCase));
        var failedCount = payments.Count(p =>
            string.Equals(p.Status, "Failed", StringComparison.OrdinalIgnoreCase));
        var totalPaid = payments
            .Where(p => string.Equals(p.Status, "Completed", StringComparison.OrdinalIgnoreCase))
            .Sum(p => MinorToMajor(p.AmountMinorUnits));

        var summary = new SuitePaymentsSummaryDto(
            TotalInvoices: payments.Count,
            Paid: paidCount,
            Failed: failedCount,
            TotalPaidZar: totalPaid);

        return new SuitePaymentsOverviewDto(
            currentPlan,
            subscriptionDto,
            lastPaymentDto,
            nextPaymentDto,
            paymentMethodDto,
            paymentMethods,
            history,
            summary);
    }

    private static SuitePaymentMethodDto MapSavedCard(CustomerSavedCardRecord card) =>
        new(
            card.Id.Value,
            card.Provider,
            SavedCardDisplayName.For(card),
            card.CardType,
            card.Last4,
            card.ExpMonth,
            card.ExpYear,
            card.Label,
            card.IsDefault);

    private static SuitePaymentsCurrentPlanDto? BuildCurrentPlan(
        Wayel.Domain.SuiteSubscriptions.SuiteSubscription? subscription,
        IReadOnlyList<SuiteCheckoutPaymentRecord> payments,
        Dictionary<Guid, SuitePlan> plansById,
        IReadOnlyList<SuitePlan> planList)
    {
        // Prefer the plan from the most recent completed payment so the
        // dashboard shows what the customer is actually on, even if the
        // subscription was activated from a legacy plan id.
        var mostRecentCompleted = payments
            .Where(p => string.Equals(p.Status, "Completed", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(p => p.CompletedAtUtc ?? p.CreatedAtUtc)
            .FirstOrDefault();

        if (mostRecentCompleted is not null
            && plansById.TryGetValue(mostRecentCompleted.PlanId.Value, out var planFromPayment))
        {
            return ToDto(planFromPayment);
        }

        // Fallback: pick the recommended/active plan so the card never goes empty.
        if (planList.Count == 0)
        {
            return null;
        }

        SuitePlan? fallback = null;
        for (var i = 0; i < planList.Count; i++)
        {
            if (planList[i].IsRecommended)
            {
                fallback = planList[i];
                break;
            }
        }

        fallback ??= planList[0];
        return ToDto(fallback);
    }

    private static SuitePaymentsCurrentPlanDto ToDto(SuitePlan plan) =>
        new(
            plan.Id.Value,
            plan.Name,
            PlanLabel(plan),
            plan.DurationMonths,
            plan.PriceZar);

    private static string PlanLabel(SuitePlan plan)
    {
        if (plan.DurationMonths == 1) return "Monthly Plan";
        if (plan.DurationMonths == 3) return "Quarterly Suite Access";
        if (plan.DurationMonths == 12) return "Annual Suite Access";
        return plan.Name;
    }

    private static SuitePaymentsSubscriptionDto? BuildSubscription(
        Wayel.Domain.SuiteSubscriptions.SuiteSubscription? subscription,
        DateTime nowUtc)
    {
        if (subscription is null)
        {
            return null;
        }

        subscription.RefreshStatus(nowUtc);

        int? daysRemaining = subscription.ExpiresAt is { } expiresAt
            ? Math.Max(0, (int)Math.Ceiling((expiresAt - nowUtc).TotalDays))
            : null;

        return new SuitePaymentsSubscriptionDto(
            subscription.SuiteNumber,
            subscription.Status.ToString(),
            StartedAtUtc: subscription.StartedAt,
            subscription.ExpiresAt,
            daysRemaining,
            subscription.ShipOutLocked,
            subscription.AutoRenewEnabled);
    }

    private static SuitePaymentsNextPaymentDto? BuildNextPayment(
        Wayel.Domain.SuiteSubscriptions.SuiteSubscription? subscription,
        SuitePaymentsCurrentPlanDto? plan,
        DateTime nowUtc)
    {
        if (plan is null)
        {
            return null;
        }

        var dueAt = subscription?.ExpiresAt ?? nowUtc.AddMonths(plan.DurationMonths);
        var daysRemaining = (int)Math.Max(0, Math.Ceiling((dueAt - nowUtc).TotalDays));
        return new SuitePaymentsNextPaymentDto(dueAt, plan.PriceZar, daysRemaining);
    }

    private static SuitePaymentHistoryRowDto MapHistoryRow(
        SuiteCheckoutPaymentRecord payment,
        Dictionary<Guid, SuitePlan> plansById)
    {
        plansById.TryGetValue(payment.PlanId.Value, out var plan);
        var planName = plan is null ? "Suite Access payment" : PlanLabel(plan) + " payment";
        var durationMonths = plan?.DurationMonths ?? 0;

        return new SuitePaymentHistoryRowDto(
            payment.Reference,
            SuitePaymentInvoiceNumbering.BuildInvoiceNumber(payment),
            payment.CreatedAtUtc,
            payment.CompletedAtUtc,
            planName,
            durationMonths,
            MinorToMajor(payment.AmountMinorUnits),
            NormalizeStatus(payment.Status));
    }

    private static string NormalizeStatus(string status) =>
        status.ToLowerInvariant() switch
        {
            "completed" => "Successful",
            "failed" => "Failed",
            _ => "Pending",
        };

    private static decimal MinorToMajor(int amountMinor) =>
        Math.Round(amountMinor / 100m, 2);
}
