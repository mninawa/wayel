using Wayel.Domain.Users;
using Wayel.Domain.SuiteSubscriptions;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuiteSubscriptionRepository
{
    Task<SuiteSubscription?> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);
    Task UpdateAsync(SuiteSubscription subscription, CancellationToken cancellationToken = default);
}
