using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Account;
using Wayel.Application.Features.Dashboard;
using Wayel.Application.Features.Parcels;
using Wayel.Application.Features.Quotes;
using Wayel.Application.Features.Shipments;
using Wayel.Application.Features.SuitePlans;
using Wayel.Application.Features.SuiteSubscriptions;

namespace Wayel.Api.Endpoints;

public sealed class BorderBoxEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/borderbox").WithTags("WeYell").RequireAuthorization();

        group.MapGet("/account", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetCustomerAccountQuery(), ct)).ToHttpResult())
            .WithName("GetCustomerAccount");

        group.MapPatch("/account/profile", async (UpdateProfileRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpdateCustomerProfileCommand(
                    body.FirstName,
                    body.LastName,
                    body.Phone,
                    body.IdNumber,
                    body.IdDocumentType,
                    body.PreferredDeliveryMethod),
                ct)).ToHttpResult())
            .WithName("UpdateCustomerProfile");

        group.MapPatch("/account/notifications", async (UpdateNotificationsRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpdateNotificationPreferencesCommand(body.Email, body.Sms, body.WhatsApp, body.Marketing),
                ct)).ToHttpResult())
            .WithName("UpdateNotificationPreferences");

        group.MapPost("/account/delivery-addresses", async (UpsertDeliveryAddressRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpsertDeliveryAddressCommand(
                    null,
                    body.Label,
                    body.FullName,
                    body.Phone,
                    body.Line1,
                    body.Line2,
                    body.City,
                    body.Region,
                    body.IsDefault),
                ct)).ToHttpResult())
            .WithName("CreateDeliveryAddress");

        group.MapPut("/account/delivery-addresses/{id:guid}", async (Guid id, UpsertDeliveryAddressRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpsertDeliveryAddressCommand(
                    id,
                    body.Label,
                    body.FullName,
                    body.Phone,
                    body.Line1,
                    body.Line2,
                    body.City,
                    body.Region,
                    body.IsDefault),
                ct)).ToHttpResult())
            .WithName("UpdateDeliveryAddress");

        group.MapDelete("/account/delivery-addresses/{id:guid}", async (Guid id, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new DeleteDeliveryAddressCommand(id), ct)).ToHttpResult())
            .WithName("DeleteDeliveryAddress");

        group.MapPost("/account/delivery-addresses/{id:guid}/default", async (Guid id, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new SetDefaultDeliveryAddressCommand(id), ct)).ToHttpResult())
            .WithName("SetDefaultDeliveryAddress");

        group.MapGet("/dashboard", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetDashboardQuery(), ct)).ToHttpResult())
            .WithName("GetDashboard");

        group.MapGet("/suite-plans", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListSuitePlansQuery(), ct)).ToHttpResult())
            .WithName("ListSuitePlans");

        group.MapPost("/suite-access/checkout", async (ActivateSuiteRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ActivateSuiteSubscriptionCommand(body.PlanId), ct)).ToHttpResult())
            .WithName("ActivateSuiteAccess");

        group.MapGet("/parcels", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListParcelsQuery(), ct)).ToHttpResult())
            .WithName("ListParcels");

        group.MapPost("/shipments", async (CreateShipmentRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateShipmentCommand(body.ParcelIds, body.DeliveryMethod), ct)).ToHttpResult())
            .WithName("CreateShipment");

        group.MapPost("/quotes/{quoteId:guid}/approve", async (Guid quoteId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ApproveQuoteCommand(quoteId), ct)).ToHttpResult())
            .WithName("ApproveQuote");
    }

    private sealed record ActivateSuiteRequest(Guid PlanId);
    private sealed record CreateShipmentRequest(IReadOnlyList<Guid> ParcelIds, string DeliveryMethod);
    private sealed record UpdateProfileRequest(
        string FirstName,
        string LastName,
        string Phone,
        string IdNumber,
        string IdDocumentType,
        string PreferredDeliveryMethod);
    private sealed record UpdateNotificationsRequest(bool Email, bool Sms, bool WhatsApp, bool Marketing);
    private sealed record UpsertDeliveryAddressRequest(
        string Label,
        string FullName,
        string Phone,
        string Line1,
        string? Line2,
        string City,
        string Region,
        bool IsDefault);
}
