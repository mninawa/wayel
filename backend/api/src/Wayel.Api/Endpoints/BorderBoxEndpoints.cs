using System.Text.Json.Serialization;
using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Notifications;
using Wayel.Application.Features.Account;
using Wayel.Application.Features.Dashboard;
using Wayel.Application.Features.Parcels;
using Wayel.Application.Features.Quotes;
using Wayel.Application.Features.Shipments;
using Wayel.Application.Features.SuitePlans;
using Wayel.Application.Features.SuiteSubscriptions;
using Wayel.Application.Features.Tracking;

namespace Wayel.Api.Endpoints;

public sealed class BorderBoxEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/borderbox").WithTags("WeYell").RequireAuthorization();

        group.MapGet("/account", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetCustomerAccountQuery(), ct)).ToHttpResult())
            .WithName("GetCustomerAccount");

        group.MapGet("/pickup-branches", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListEswatiniPickupBranchesQuery(), ct)).ToHttpResult())
            .WithName("ListEswatiniPickupBranches");

        group.MapGet("/pricing/config", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetBorderBoxPricingConfigQuery(), ct)).ToHttpResult())
            .WithName("GetBorderBoxPricingConfig");

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

        group.MapGet("/account/in-app-notifications", async (int? limit, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListCustomerInAppNotificationsQuery(limit ?? 20), ct)).ToHttpResult())
            .WithName("ListCustomerInAppNotifications");

        group.MapGet("/account/in-app-notifications/unread-count", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetCustomerInAppNotificationUnreadCountQuery(), ct)).ToHttpResult())
            .WithName("GetCustomerInAppNotificationUnreadCount");

        group.MapPost("/account/in-app-notifications/{notificationId}/read", async (
            string notificationId,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new MarkCustomerInAppNotificationReadCommand(notificationId), ct)).ToHttpResult())
            .WithName("MarkCustomerInAppNotificationRead");

        group.MapPost("/account/in-app-notifications/read-all", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new MarkAllCustomerInAppNotificationsReadCommand(), ct)).ToHttpResult())
            .WithName("MarkAllCustomerInAppNotificationsRead");

        group.MapPost("/account/kyc/submit", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new SubmitKycVerificationCommand(), ct)).ToHttpResult())
            .WithName("SubmitKycVerification");

        group.MapGet("/account/kyc/status", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetCustomerKycStatusQuery(), ct)).ToHttpResult())
            .WithName("GetCustomerKycStatus");

        group.MapPost("/account/kyc/documents/upload-ticket", async (
            KycDocumentUploadTicketRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new CreateKycDocumentUploadTicketCommand(body.Side, body.FileName, body.ContentType, body.SizeBytes),
                ct)).ToHttpResult())
            .WithName("CreateKycDocumentUploadTicket");

        group.MapPost("/account/kyc/documents/{documentId:guid}/confirm", async (
            Guid documentId,
            ConfirmKycDocumentUploadRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new ConfirmKycDocumentUploadCommand(documentId, body.FileName, body.ContentType, body.SizeBytes),
                ct)).ToHttpResult())
            .WithName("ConfirmKycDocumentUpload");

        group.MapPut("/account/kyc/documents/{documentId:guid}/blob", async (
            Guid documentId,
            HttpRequest request,
            IMediator mediator,
            CancellationToken ct) =>
        {
            await using var stream = request.Body;
            var result = await mediator.Send(new UploadKycDocumentBytesCommand(documentId, stream), ct);
            return result.ToHttpResult();
        })
            .DisableAntiforgery()
            .WithName("UploadKycDocumentBlob");

        group.MapPost("/account/delivery-addresses", async (UpsertDeliveryAddressRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpsertDeliveryAddressCommand(
                    null,
                    body.BranchId,
                    body.Label,
                    body.FullName,
                    body.Phone,
                    body.IsDefault),
                ct)).ToHttpResult())
            .WithName("CreateDeliveryAddress");

        group.MapPut("/account/delivery-addresses/{id:guid}", async (Guid id, UpsertDeliveryAddressRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new UpsertDeliveryAddressCommand(
                    id,
                    body.BranchId,
                    body.Label,
                    body.FullName,
                    body.Phone,
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

        group.MapGet("/account/suite-payments", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetSuitePaymentsOverviewQuery(), ct)).ToHttpResult())
            .WithName("GetSuitePaymentsOverview");

        group.MapPost("/suite-access/checkout/initiate", async (
            InitiateSuiteCheckoutRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new InitiateSuiteCheckoutCommand(body.PlanId, body.CallbackUrl),
                ct)).ToHttpResult())
            .WithName("InitiateSuiteCheckout");

        group.MapPost("/suite-access/checkout/complete", async (
            CompleteSuiteCheckoutRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new CompleteSuiteCheckoutCommand(body.Reference), ct)).ToHttpResult())
            .WithName("CompleteSuiteCheckout");

        group.MapGet("/parcels", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListParcelsQuery(), ct)).ToHttpResult())
            .WithName("ListParcels");

        group.MapGet("/parcels/{parcelId:guid}", async (Guid parcelId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetParcelQuery(parcelId), ct)).ToHttpResult())
            .WithName("GetParcel");

        group.MapGet("/parcels/{parcelId:guid}/quotes", async (Guid parcelId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetParcelQuoteHistoryQuery(parcelId), ct)).ToHttpResult())
            .WithName("GetParcelQuoteHistory");

        group.MapPatch("/parcels/{parcelId:guid}/physical", async (
            Guid parcelId,
            UpdateParcelPhysicalRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new UpdateParcelPhysicalAttributesCommand(
                    parcelId,
                    body.WeightKg,
                    body.DimensionsLabel,
                    body.DeclaredValueZar),
                ct)).ToHttpResult())
            .WithName("UpdateParcelPhysicalAttributes");

        group.MapPost("/parcels/{parcelId:guid}/invoice", async (
            Guid parcelId,
            HttpRequest httpRequest,
            IMediator mediator,
            CancellationToken ct) =>
        {
            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest(new { error = "multipart/form-data required." });
            }

            var file = httpRequest.Form.Files.GetFile("file")
                ?? (httpRequest.Form.Files.Count > 0 ? httpRequest.Form.Files[0] : null);
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "file is required." });
            }

            await using var stream = file.OpenReadStream();
            var result = await mediator.Send(
                new UploadParcelInvoiceCommand(
                    parcelId,
                    file.FileName,
                    file.ContentType,
                    file.Length,
                    stream),
                ct);
            return result.ToHttpResult();
        })
            .WithName("UploadParcelInvoice")
            .DisableAntiforgery();

        group.MapGet("/parcels/{parcelId:guid}/invoice/download", async (
            Guid parcelId,
            HttpRequest httpRequest,
            IMediator mediator,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(new DownloadParcelInvoiceQuery(parcelId), ct);
            if (result.IsFailure)
            {
                return result.ToHttpResult();
            }

            var file = result.Value;
            var forceDownload = httpRequest.Query.ContainsKey("download");
            return Results.File(
                file.Content,
                contentType: file.ContentType,
                fileDownloadName: forceDownload ? file.FileName : null,
                enableRangeProcessing: true);
        })
            .WithName("DownloadParcelInvoice");

        group.MapPost("/shipments/estimate", async (EstimateShipmentRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new EstimateShipmentQuoteQuery(body.ParcelIds, body.DeliveryMethod),
                ct)).ToHttpResult())
            .WithName("EstimateShipmentQuote");

        group.MapPost("/shipments", async (CreateShipmentRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateShipmentCommand(body.ParcelIds, body.DeliveryMethod), ct)).ToHttpResult())
            .WithName("CreateShipment");

        group.MapPost("/quotes/requests", async (CreateQuoteRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new CreateQuoteRequestCommand(body.ParcelIds, body.DeliveryMethod),
                ct)).ToHttpResult())
            .WithName("CreateQuoteRequest");

        group.MapGet("/quotes", async (string? status, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ListQuotesQuery(status), ct)).ToHttpResult())
            .WithName("ListQuotes");

        group.MapGet("/quotes/{quoteId:guid}", async (Guid quoteId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetQuoteQuery(quoteId), ct)).ToHttpResult())
            .WithName("GetQuote");

        group.MapPost("/quotes/{quoteId:guid}/approve", async (Guid quoteId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new ApproveQuoteCommand(quoteId), ct)).ToHttpResult())
            .WithName("ApproveQuote");

        group.MapPost("/quotes/{quoteId:guid}/cancel", async (Guid quoteId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CancelQuoteCommand(quoteId), ct)).ToHttpResult())
            .WithName("CancelQuote");

        group.MapPost("/quotes/{quoteId:guid}/checkout/initiate", async (
            Guid quoteId,
            InitiateQuoteCheckoutRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new InitiateQuoteCheckoutCommand(quoteId, body.CallbackUrl),
                ct)).ToHttpResult())
            .WithName("InitiateQuoteCheckout");

        group.MapPost("/quotes/checkout/complete", async (
            CompleteQuoteCheckoutRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new CompleteQuoteCheckoutCommand(body.Reference), ct)).ToHttpResult())
            .WithName("CompleteQuoteCheckout");

        group.MapGet("/quotes/{quoteId:guid}/payment-invoice/download", async (
            Guid quoteId,
            HttpRequest httpRequest,
            IMediator mediator,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(new DownloadQuotePaymentInvoiceQuery(quoteId), ct);
            if (result.IsFailure)
            {
                return result.ToHttpResult();
            }

            var file = result.Value;
            var forceDownload = httpRequest.Query.ContainsKey("download");
            return Results.File(
                file.Content,
                contentType: file.ContentType,
                fileDownloadName: forceDownload ? file.FileName : null,
                enableRangeProcessing: true);
        })
            .WithName("DownloadQuotePaymentInvoice");

        group.MapGet("/tracking-support", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetTrackingSupportOverviewQuery(), ct)).ToHttpResult())
            .WithName("GetTrackingSupportOverview");

        group.MapGet("/shipments/{shipmentId:guid}/tracking", async (Guid shipmentId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetShipmentTrackingDetailQuery(shipmentId), ct)).ToHttpResult())
            .WithName("GetShipmentTrackingDetail");

        group.MapGet("/parcels/{parcelId:guid}/tracking", async (Guid parcelId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetParcelShipmentTrackingQuery(parcelId), ct)).ToHttpResult())
            .WithName("GetParcelShipmentTracking");

        group.MapPost("/support/tickets", async (CreateSupportTicketRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new CreateSupportTicketCommand(body.Subject, body.Body), ct)).ToHttpResult())
            .WithName("CreateSupportTicket");
    }

    private sealed record UpdateParcelPhysicalRequest(
        [property: JsonPropertyName("weightKg")] decimal? WeightKg,
        [property: JsonPropertyName("dimensionsLabel")] string? DimensionsLabel,
        [property: JsonPropertyName("declaredValueZar")] decimal? DeclaredValueZar);
    private sealed record CreateSupportTicketRequest(string Subject, string Body);
    private sealed record ActivateSuiteRequest(Guid PlanId);
    private sealed record InitiateSuiteCheckoutRequest(Guid PlanId, string CallbackUrl);
    private sealed record CompleteSuiteCheckoutRequest(string Reference);
    private sealed record EstimateShipmentRequest(IReadOnlyList<Guid> ParcelIds, string DeliveryMethod);
    private sealed record CreateShipmentRequest(IReadOnlyList<Guid> ParcelIds, string DeliveryMethod);
    private sealed record CreateQuoteRequest(IReadOnlyList<Guid> ParcelIds, string DeliveryMethod);
    private sealed record InitiateQuoteCheckoutRequest(string CallbackUrl);
    private sealed record CompleteQuoteCheckoutRequest(string Reference);
    private sealed record UpdateProfileRequest(
        [property: JsonPropertyName("firstName")] string FirstName,
        [property: JsonPropertyName("lastName")] string LastName,
        [property: JsonPropertyName("phone")] string Phone,
        [property: JsonPropertyName("idNumber")] string IdNumber,
        [property: JsonPropertyName("idDocumentType")] string IdDocumentType,
        [property: JsonPropertyName("preferredDeliveryMethod")] string PreferredDeliveryMethod);
    private sealed record UpdateNotificationsRequest(
        [property: JsonPropertyName("email")] bool Email,
        [property: JsonPropertyName("sms")] bool Sms,
        [property: JsonPropertyName("whatsApp")] bool WhatsApp,
        [property: JsonPropertyName("marketing")] bool Marketing);
    private sealed record KycDocumentUploadTicketRequest(
        string Side,
        string FileName,
        string ContentType,
        long SizeBytes);
    private sealed record ConfirmKycDocumentUploadRequest(
        string FileName,
        string ContentType,
        long SizeBytes);
    private sealed record UpsertDeliveryAddressRequest(
        [property: JsonPropertyName("branchId")] string BranchId,
        string Label,
        string FullName,
        string Phone,
        bool IsDefault);
}
