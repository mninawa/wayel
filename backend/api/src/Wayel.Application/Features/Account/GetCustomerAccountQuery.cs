using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record GetCustomerAccountQuery : IQuery<CustomerAccountResponse>;

internal sealed class GetCustomerAccountQueryHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities)
    : IQueryHandler<GetCustomerAccountQuery, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        GetCustomerAccountQuery request,
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

        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, cancellationToken);
        var allAddresses = await addresses.ListForUserAsync(user.Id, cancellationToken);
        var linked = await identities.GetForUserAsync(user.Id, cancellationToken);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);

        return CustomerAccountMapper.Map(user, suiteAddress, allAddresses, hasGoogle);
    }
}
