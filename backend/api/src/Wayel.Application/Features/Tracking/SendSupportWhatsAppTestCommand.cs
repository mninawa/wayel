using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Configuration;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Tracking;

public sealed record SendSupportWhatsAppTestCommand : ICommand<WhatsAppTestSendResultDto>;

public sealed record WhatsAppTestSendResultDto(
    bool Sent,
    string? ProviderMessageId,
    string? ErrorMessage);

internal sealed class SendSupportWhatsAppTestCommandHandler(
    ICurrentUser current,
    IUserRepository users,
    IWhatsAppSender whatsApp,
    IOptions<WaSenderNotificationOptions> waSenderOptions) : ICommandHandler<SendSupportWhatsAppTestCommand, WhatsAppTestSendResultDto>
{
    public async Task<Result<WhatsAppTestSendResultDto>> Handle(
        SendSupportWhatsAppTestCommand request,
        CancellationToken cancellationToken)
    {
        if (current.UserId is null)
        {
            return Error.Unauthorized("auth.unauthenticated", "Not authenticated.");
        }

        if (!waSenderOptions.Value.IsConfiguredForDelivery)
        {
            return Error.Validation(
                "whatsapp.not_configured",
                "WhatsApp delivery is not enabled on this server. Ask your administrator to set Notifications__WaSender__Enabled=true and Notifications__WaSender__ApiKey on the API service.");
        }

        var user = await users.GetByIdAsync(current.UserId.Value, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(current.UserId.Value);
        }

        if (string.IsNullOrWhiteSpace(user.Phone))
        {
            return Error.Validation(
                "whatsapp.no_phone",
                "Add a mobile number on your profile before testing WhatsApp notifications.");
        }

        var displayName = string.IsNullOrWhiteSpace(user.FirstName)
            ? "there"
            : user.FirstName.Trim();

        var body =
            $"Hi {displayName}, this is a test from WeYell. If you received this, WhatsApp parcel updates will work on this number. " +
            "Manage preferences anytime under Support → Notifications.";

        var result = await whatsApp.SendTextAsync(
            new WhatsAppTextMessage(
                user.Phone.Trim(),
                body,
                "support.whatsapp_test",
                BypassAllowlist: true),
            cancellationToken);

        if (!result.IsSuccess)
        {
            return new WhatsAppTestSendResultDto(
                false,
                null,
                result.ErrorMessage ?? "Could not send the test message.");
        }

        return new WhatsAppTestSendResultDto(true, result.ProviderMessageId, null);
    }
}
