using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Addresses;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record UpsertDeliveryAddressCommand(
    Guid? Id,
    string BranchId,
    string Label,
    string FullName,
    string Phone,
    bool IsDefault) : ICommand<CustomerAccountResponse>;

internal sealed class UpsertDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IPickupBranchRepository pickupBranches,
    IUnitOfWork unitOfWork,
    CustomerAccountResponseBuilder accountResponse) : ICommandHandler<UpsertDeliveryAddressCommand, CustomerAccountResponse>
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

        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            return Error.Validation("address.phone_required", "Phone number is required.");
        }

        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            return Error.Validation("address.recipient_required", "Full name is required.");
        }

        var branch = await pickupBranches.GetByIdAsync(request.BranchId, cancellationToken);
        if (branch is null || !branch.IsActive)
        {
            return Error.Validation("address.branch_invalid", "Select a valid WeYell pickup branch.");
        }

        var label = string.IsNullOrWhiteSpace(request.Label) ? branch.Name : request.Label.Trim();
        var branchId = branch.Id;

        CustomerAddress address;
        if (request.Id is null)
        {
            address = CustomerAddress.CreateDelivery(
                user.Id,
                branchId,
                label,
                request.FullName,
                request.Phone,
                branch.Line1,
                branch.Line2,
                branch.City,
                branch.Region,
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
                branchId,
                label,
                request.FullName,
                request.Phone,
                branch.Line1,
                branch.Line2,
                branch.City,
                branch.Region,
                request.IsDefault);
            address = existing;
            await addresses.UpdateAsync(address, cancellationToken);
        }

        if (request.IsDefault)
        {
            await ClearOtherDefaultsAsync(user.Id, address.Id, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        return await accountResponse.BuildAsync(user, cancellationToken);
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
}

public sealed record DeleteDeliveryAddressCommand(Guid Id) : ICommand<CustomerAccountResponse>;

internal sealed class DeleteDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IUnitOfWork unitOfWork,
    CustomerAccountResponseBuilder accountResponse) : ICommandHandler<DeleteDeliveryAddressCommand, CustomerAccountResponse>
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

        return await accountResponse.BuildAsync(user, cancellationToken);
    }
}

public sealed record SetDefaultDeliveryAddressCommand(Guid Id) : ICommand<CustomerAccountResponse>;

internal sealed class SetDefaultDeliveryAddressCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    ICustomerAddressRepository addresses,
    IUnitOfWork unitOfWork,
    CustomerAccountResponseBuilder accountResponse) : ICommandHandler<SetDefaultDeliveryAddressCommand, CustomerAccountResponse>
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

        return await accountResponse.BuildAsync(user, cancellationToken);
    }
}
