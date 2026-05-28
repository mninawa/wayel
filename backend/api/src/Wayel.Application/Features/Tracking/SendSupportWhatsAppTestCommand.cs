using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
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
    IWhatsAppSender whatsApp) : ICommandHandler<SendSupportWhatsAppTestCommand, WhatsAppTestSendResultDto>
{
    private const string LoggingStubId = "logging-stub";

    public async Task<Result<WhatsAppTestSendResultDto>> Handle(
        SendSupportWhatsAppTestCommand request,
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

        if (result.IsSuccess && string.Equals(result.ProviderMessageId, LoggingStubId, StringComparison.Ordinal))
        {
            return Error.Validation(
                "whatsapp.not_configured",
                "WhatsApp delivery is not enabled on this environment. Contact support by email or open a ticket.");
        }

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
