using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface ISuiteNumberAllocator
{
  Task<string> ResolveAsync(
    User user,
    SuiteSubscription? existingSubscription,
    bool allocateNew,
    CancellationToken cancellationToken = default);
}
