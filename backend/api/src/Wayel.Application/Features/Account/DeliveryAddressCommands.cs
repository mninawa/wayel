using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Addresses;
using Wayel.Domain.Common;
using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record UpsertDeliveryAddressCommand(
    Guid? Id,
    string Label,
    string FullName,
    string Phone,
    string Line1,
    string? Line2,
    string City,
    string Region,
    bool IsDefault) : ICommand<CustomerAccountResponse>;

internal sealed class UpsertDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities,
    IUnitOfWork unitOfWork) : ICommandHandler<UpsertDeliveryAddressCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        UpsertDeliveryAddressCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        var userId = current.UserId.Value;
        var user = await users.GetByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(userId);
        }

        CustomerAddress address;
        if (request.Id is null)
        {
            address = CustomerAddress.CreateDelivery(
                user.Id,
                request.Label,
                request.FullName,
                request.Phone,
                request.Line1,
                request.Line2,
                request.City,
                request.Region,
                user.DestinationCountry,
                request.IsDefault);
            await addresses.AddAsync(address, cancellationToken);
        }
        else
        {
            var existing = await addresses.GetByIdForUserAsync(new CustomerAddressId(request.Id.Value), user.Id, cancellationToken);
            if (existing is null || existing.IsSuiteAddress)
            {
                return Error.NotFound("address.not_found", "Delivery address not found.");
            }

            existing.UpdateDelivery(
                request.Label,
                request.FullName,
                request.Phone,
                request.Line1,
                request.Line2,
                request.City,
                request.Region,
                request.IsDefault);
            address = existing;
            await addresses.UpdateAsync(address, cancellationToken);
        }

        if (request.IsDefault)
        {
            await ClearOtherDefaultsAsync(user.Id, address.Id, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildResponseAsync(user, cancellationToken);
    }

    private async Task ClearOtherDefaultsAsync(UserId userId, CustomerAddressId keepId, CancellationToken ct)
    {
        var all = await addresses.ListForUserAsync(userId, ct);
        foreach (var item in all.Where(a => !a.IsSuiteAddress && a.Id != keepId && a.IsDefault))
        {
            item.SetDefault(false);
            await addresses.UpdateAsync(item, ct);
        }
    }

    private async Task<CustomerAccountResponse> BuildResponseAsync(User user, CancellationToken ct)
    {
        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, ct);
        var allAddresses = await addresses.ListForUserAsync(user.Id, ct);
        var linked = await identities.GetForUserAsync(user.Id, ct);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);
        return CustomerAccountMapper.Map(user, suiteAddress, allAddresses, hasGoogle);
    }
}

public sealed record DeleteDeliveryAddressCommand(Guid Id) : ICommand<CustomerAccountResponse>;

internal sealed class DeleteDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities,
    IUnitOfWork unitOfWork) : ICommandHandler<DeleteDeliveryAddressCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        DeleteDeliveryAddressCommand request,
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

        var existing = await addresses.GetByIdForUserAsync(new CustomerAddressId(request.Id), user.Id, cancellationToken);
        if (existing is null || existing.IsSuiteAddress)
        {
            return Error.NotFound("address.not_found", "Delivery address not found.");
        }

        await addresses.DeleteAsync(existing.Id, user.Id, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, cancellationToken);
        var allAddresses = await addresses.ListForUserAsync(user.Id, cancellationToken);
        var linked = await identities.GetForUserAsync(user.Id, cancellationToken);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);

        return CustomerAccountMapper.Map(user, suiteAddress, allAddresses, hasGoogle);
    }
}

public sealed record SetDefaultDeliveryAddressCommand(Guid Id) : ICommand<CustomerAccountResponse>;

internal sealed class SetDefaultDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IExternalIdentityRepository identities,
    IUnitOfWork unitOfWork) : ICommandHandler<SetDefaultDeliveryAddressCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        SetDefaultDeliveryAddressCommand request,
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

        var target = await addresses.GetByIdForUserAsync(new CustomerAddressId(request.Id), user.Id, cancellationToken);
        if (target is null || target.IsSuiteAddress)
        {
            return Error.NotFound("address.not_found", "Delivery address not found.");
        }

        var all = await addresses.ListForUserAsync(user.Id, cancellationToken);
        foreach (var item in all.Where(a => !a.IsSuiteAddress))
        {
            item.SetDefault(item.Id == target.Id);
            await addresses.UpdateAsync(item, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        var suiteAddress = await addresses.GetSuiteForUserAsync(user.Id, cancellationToken);
        var linked = await identities.GetForUserAsync(user.Id, cancellationToken);
        var hasGoogle = linked.Any(i => i.Provider == IdentityProvider.Google);

        return CustomerAccountMapper.Map(user, suiteAddress, all, hasGoogle);
    }
}
