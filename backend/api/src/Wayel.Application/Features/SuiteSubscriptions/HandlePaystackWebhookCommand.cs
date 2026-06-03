using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Payments;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.SuiteSubscriptions;

public sealed record HandlePaystackWebhookCommand(string RawBody, string? SignatureHeader)
    : ICommand<HandlePaystackWebhookResult>;

public sealed record HandlePaystackWebhookResult(bool Accepted, string? RejectionReason);

internal sealed class HandlePaystackWebhookCommandHandler(
    IPaystackSubscriptionBilling paystackBilling,
    SuiteCheckoutCompletionService completionService) : ICommandHandler<HandlePaystackWebhookCommand, HandlePaystackWebhookResult>
{
    public async Task<Result<HandlePaystackWebhookResult>> Handle(
        HandlePaystackWebhookCommand request,
        CancellationToken cancellationToken)
    {
        if (!paystackBilling.TryParseWebhook(
                request.RawBody,
                request.SignatureHeader,
                out var webhookEvent)
            || webhookEvent is null)
        {
            return new HandlePaystackWebhookResult(false, "invalid_signature_or_payload");
        }

        var eventType = webhookEvent.EventType.Trim().ToLowerInvariant();
        Result processResult = eventType switch
        {
            "charge.success" => await completionService.ProcessPaystackChargeSuccessAsync(
                webhookEvent,
                cancellationToken),
            "subscription.disable" or "subscription.not_renew" => await completionService.ProcessPaystackSubscriptionDisabledAsync(
                webhookEvent,
                cancellationToken),
            _ => Result.Success(),
        };

        if (processResult.IsFailure)
        {
            return processResult.Error;
        }

        return new HandlePaystackWebhookResult(true, null);
    }
}
