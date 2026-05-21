using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record UpdateCustomerProfileCommand(
    string FirstName,
    string LastName,
    string Phone,
    string IdNumber,
    string IdDocumentType,
    string PreferredDeliveryMethod) : ICommand<CustomerAccountResponse>;

internal sealed class UpdateCustomerProfileCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities,
    IUnitOfWork unitOfWork) : ICommandHandler<UpdateCustomerProfileCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        UpdateCustomerProfileCommand request,
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

        if (string.IsNullOrWhiteSpace(request.FirstName) ||
            string.IsNullOrWhiteSpace(request.LastName) ||
            string.IsNullOrWhiteSpace(request.Phone) ||
            string.IsNullOrWhiteSpace(request.IdNumber) ||
            string.IsNullOrWhiteSpace(request.IdDocumentType) ||
            string.IsNullOrWhiteSpace(request.PreferredDeliveryMethod))
        {
            return Error.Validation("account.profile_invalid", "All profile fields are required.");
        }

        user.UpdateCustomerProfile(
            request.FirstName,
            request.LastName,
            request.Phone,
            request.IdNumber,
            request.IdDocumentType,
            request.PreferredDeliveryMethod);

        await users.UpdateAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, cancellationToken);
        var allAddresses = await addresses.ListForUserAsync(user.Id, cancellationToken);
        var linked = await identities.GetForUserAsync(user.Id, cancellationToken);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);

        return CustomerAccountMapper.Map(user, suiteAddress, allAddresses, hasGoogle);
    }
}
