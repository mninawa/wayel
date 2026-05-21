using Wayel.Domain.Sessions;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default);
    Task AddAsync(RefreshToken token, CancellationToken cancellationToken = default);
    Task UpdateAsync(RefreshToken token, CancellationToken cancellationToken = default);
    Task RevokeSessionAsync(string sessionId, DateTime nowUtc, CancellationToken cancellationToken = default);
    Task RevokeAllForUserAsync(UserId userId, DateTime nowUtc, CancellationToken cancellationToken = default);
}
