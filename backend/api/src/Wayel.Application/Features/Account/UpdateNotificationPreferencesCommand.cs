using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

public sealed record UpdateNotificationPreferencesCommand(
    bool Email,
    bool Sms,
    bool WhatsApp,
    bool Marketing) : ICommand<CustomerAccountResponse>;

internal sealed class UpdateNotificationPreferencesCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IUnitOfWork unitOfWork,
    CustomerAccountResponseBuilder accountResponse) : ICommandHandler<UpdateNotificationPreferencesCommand, CustomerAccountResponse>
{
    public async Task<Result<CustomerAccountResponse>> Handle(
        UpdateNotificationPreferencesCommand request,
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

        user.UpdateNotificationPreferences(request.Email, request.Sms, request.WhatsApp, request.Marketing);
        await users.UpdateAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return await accountResponse.BuildAsync(user, cancellationToken);
    }
}
