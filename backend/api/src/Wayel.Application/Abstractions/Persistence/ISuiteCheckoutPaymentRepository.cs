using Wayel.Domain.SuitePlans;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public sealed record SuiteCheckoutPaymentRecord(
    string Reference,
    UserId UserId,
    SuitePlanId PlanId,
    int AmountMinorUnits,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? CompletedAtUtc);

public interface ISuiteCheckoutPaymentRepository
{
    Task<SuiteCheckoutPaymentRecord?> GetByReferenceAsync(string reference, CancellationToken cancellationToken = default);
    Task<int> CountCompletedForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(SuiteCheckoutPaymentRecord payment, CancellationToken cancellationToken = default);
    Task MarkCompletedAsync(string reference, DateTime completedAtUtc, CancellationToken cancellationToken = default);

    /// <summary>All suite-access payments for a user (most recent first).</summary>
    Task<IReadOnlyList<SuiteCheckoutPaymentRecord>> ListForUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default);
}
