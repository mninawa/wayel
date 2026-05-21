using Wayel.Domain.Addresses;
using Wayel.Domain.Users;

namespace Wayel.Application.Abstractions.Persistence;

public interface ICustomerAddressRepository
{
    Task<CustomerAddress?> GetSuiteForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task<CustomerAddress?> GetByIdForUserAsync(CustomerAddressId id, UserId userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CustomerAddress>> ListForUserAsync(UserId userId, CancellationToken cancellationToken = default);
    Task AddAsync(CustomerAddress address, CancellationToken cancellationToken = default);
    Task UpdateAsync(CustomerAddress address, CancellationToken cancellationToken = default);
    Task DeleteAsync(CustomerAddressId id, UserId userId, CancellationToken cancellationToken = default);
}
