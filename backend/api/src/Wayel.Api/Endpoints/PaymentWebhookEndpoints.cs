using MediatR;
using Wayel.Application.Features.Payments;
using Wayel.Application.Features.SuiteSubscriptions;

namespace Wayel.Api.Endpoints;

/// <summary>
/// Unauthenticated public webhooks for payment gateways.
///
/// MoMo does not sign callback bodies; it posts the final transaction status
/// to the URL we configured during sandbox provisioning. We treat the callback
/// purely as a wake-up signal and re-fetch authoritative status from MTN.
/// </summary>
public sealed class PaymentWebhookEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/webhooks/payments")
            .WithTags("Webhooks")
            .AllowAnonymous()
            .RequireRateLimiting("webhook");

        group.MapPost("/momo/{reference}", async (
            string reference,
            IMediator mediator,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Wayel.PaymentWebhooks");
            try
            {
                var status = await mediator.Send(new GetPaymentStatusQuery(reference), ct);
                if (status.IsFailure)
                {
                    logger.LogInformation(
                        "MoMo callback received for unknown reference {Reference}: {Error}",
                        reference,
                        status.Error.Message);
                    return Results.NoContent();
                }
                logger.LogInformation(
                    "MoMo callback acknowledged. Reference={Reference} Status={Status}",
                    reference,
                    status.Value.Status);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "MoMo callback handler crashed for {Reference}", reference);
            }
            return Results.NoContent();
        })
            .WithName("MomoPaymentCallback");

        group.MapPost("/paystack", async (
            HttpRequest httpRequest,
            IMediator mediator,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Wayel.PaymentWebhooks");
            string body;
            using (var reader = new StreamReader(httpRequest.Body))
            {
                body = await reader.ReadToEndAsync(ct);
            }

            var signature = httpRequest.Headers["x-paystack-signature"].FirstOrDefault();
            var result = await mediator.Send(new HandlePaystackWebhookCommand(body, signature), ct);
            if (result.IsFailure)
            {
                logger.LogWarning(
                    "Paystack webhook rejected: {Error}",
                    result.Error.Message);
                return Results.BadRequest();
            }

            if (!result.Value.Accepted)
            {
                logger.LogWarning(
                    "Paystack webhook not accepted: {Reason}",
                    result.Value.RejectionReason);
                return Results.Unauthorized();
            }

            logger.LogInformation("Paystack webhook processed.");
            return Results.Ok();
        })
            .WithName("PaystackPaymentWebhook");
    }
}
