using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken = default);
    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<bool> ExistsForEmailAsync(string email, CancellationToken cancellationToken = default);
    Task AddAsync(User user, CancellationToken cancellationToken = default);
    Task UpdateAsync(User user, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<User>> ListByKycStatusAsync(
        KycStatus status,
        CancellationToken cancellationToken = default);

    Task<CustomerAccountPage> ListCustomersPageAsync(
        string? search,
        KycStatus? kycStatus,
        string? countryCode,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);
}

public sealed record CustomerAccountPage(IReadOnlyList<User> Items, int TotalCount);
