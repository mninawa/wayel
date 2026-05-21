using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface IExternalIdentityRepository
{
    Task<ExternalIdentity?> GetByProviderSubjectAsync(IdentityProvider provider, string providerSubject, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ExternalIdentity>> GetForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(ExternalIdentity identity, CancellationToken cancellationToken = default);
    Task UpdateAsync(ExternalIdentity identity, CancellationToken cancellationToken = default);
}
