using MediatR;
using Wayel.Application.Features.Payments;

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
            .AllowAnonymous();

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
    }
}
