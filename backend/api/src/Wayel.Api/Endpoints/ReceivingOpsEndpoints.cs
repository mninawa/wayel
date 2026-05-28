using MediatR;
using Wayel.Api.Infrastructure;
using Wayel.Application.Features.Parcels;

namespace Wayel.Api.Endpoints;

/// <summary>Parcel receiving module — aligns with WeYell Ops build document routes.</summary>
public sealed class ReceivingOpsEndpoints : IEndpointGroup
{
    public void Map(IEndpointRouteBuilder routes)
    {
        var group = routes
            .MapGroup("/borderbox/ops/receiving")
            .WithTags("WeYell Parcel Receiving")
            .RequireAuthorization(AuthorizationPolicies.KycOps);

        group.MapGet("/access", async (IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsAccessQuery(), ct)).ToHttpResult())
            .WithName("GetOpsReceivingAccess");

        group.MapGet("/dashboard", async (IMediator mediator, CancellationToken ct, int limit = 50) =>
            (await mediator.Send(new GetOpsReceivingDashboardQuery(limit), ct)).ToHttpResult())
            .WithName("GetOpsReceivingDashboard");

        group.MapGet("/exceptions", async (IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25) =>
            (await mediator.Send(new ListOpsExceptionsQuery(page, pageSize), ct)).ToHttpResult())
            .WithName("ListOpsReceivingExceptions");

        group.MapGet("/ready-for-quote", async (IMediator mediator, CancellationToken ct, int page = 1, int pageSize = 25) =>
            (await mediator.Send(new ListOpsReadyForQuoteQuery(page, pageSize), ct)).ToHttpResult())
            .WithName("ListOpsReadyForQuote");

        group.MapGet("/search", async (string q, IMediator mediator, CancellationToken ct, int limit = 30) =>
            (await mediator.Send(new SearchOpsReceivingQuery(q, limit), ct)).ToHttpResult())
            .WithName("SearchOpsReceiving");

        group.MapPost("/parcels/{parcelId:guid}/suite-match", async (
            Guid parcelId,
            ConfirmSuiteMatchRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new ConfirmParcelSuiteMatchCommand(parcelId, body.SuiteNumber), ct)).ToHttpResult())
            .WithName("ConfirmOpsParcelSuiteMatch");

        group.MapPost("/exceptions/{parcelId:guid}/{exceptionType}/assign", async (
            Guid parcelId,
            string exceptionType,
            AssignExceptionRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new AssignOpsExceptionCommand(parcelId, exceptionType, body.AssignedTo), ct))
                .ToHttpResult())
            .WithName("AssignOpsException");

        group.MapPost("/exceptions/{parcelId:guid}/{exceptionType}/escalate", async (
            Guid parcelId,
            string exceptionType,
            EscalateExceptionRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new EscalateOpsExceptionCommand(parcelId, exceptionType, body.EscalatedTo, body.Notes),
                ct)).ToHttpResult())
            .WithName("EscalateOpsException");

        group.MapPost("/exceptions/{parcelId:guid}/{exceptionType}/resolve", async (
            Guid parcelId,
            string exceptionType,
            ResolveExceptionRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(new ResolveOpsExceptionCommand(parcelId, exceptionType, body.Notes), ct))
                .ToHttpResult())
            .WithName("ResolveOpsException");

        group.MapPost("/parcels/intake", async (ReceiveParcelIntakeRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(
                new ReceiveParcelCommand(
                    body.SuiteNumber,
                    body.Retailer,
                    body.TrackingNumber,
                    body.ItemName,
                    body.Category,
                    body.DeclaredValueZar,
                    body.DimensionsLabel,
                    body.WeightKg),
                ct)).ToHttpResult())
            .WithName("OpsParcelIntake");

        group.MapGet("/parcels/{parcelId:guid}", async (Guid parcelId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new GetOpsParcelQuery(parcelId), ct)).ToHttpResult())
            .WithName("GetOpsReceivingParcel");

        group.MapGet("/parcels/{parcelId:guid}/activity", async (
            Guid parcelId,
            IMediator mediator,
            CancellationToken ct,
            int limit = 50) =>
            (await mediator.Send(new ListOpsParcelActivityQuery(parcelId, limit), ct)).ToHttpResult())
            .WithName("ListOpsParcelActivity");

        group.MapGet("/parcels/{parcelId:guid}/invoice/file", async (
            Guid parcelId,
            IMediator mediator,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(new DownloadOpsParcelInvoiceQuery(parcelId), ct);
            if (result.IsFailure)
            {
                return result.ToHttpResult();
            }

            var file = result.Value;
            return Results.File(file.Content, file.ContentType, file.FileName);
        }).WithName("DownloadOpsParcelInvoice");

        group.MapPost("/parcels/{parcelId:guid}/invoice/upload", async (
            Guid parcelId,
            HttpRequest request,
            IMediator mediator,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { detail = "multipart/form-data required." });
            }

            var file = request.Form.Files.GetFile("file")
                ?? (request.Form.Files.Count > 0 ? request.Form.Files[0] : null);
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { detail = "file is required." });
            }

            await using var stream = file.OpenReadStream();
            var result = await mediator.Send(
                new UploadOpsParcelInvoiceCommand(
                    parcelId,
                    file.FileName,
                    file.ContentType,
                    file.Length,
                    stream),
                ct);
            return result.ToHttpResult();
        })
            .DisableAntiforgery()
            .WithName("UploadOpsParcelInvoice");

        group.MapPost("/parcels/{parcelId:guid}/invoice/upload-reminder", async (
            Guid parcelId,
            SendParcelInvoiceUploadReminderRequest? body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new SendParcelInvoiceUploadReminderCommand(parcelId, body?.ForceResend ?? false),
                ct)).ToHttpResult())
            .WithName("SendOpsParcelInvoiceUploadReminder");

        group.MapGet("/parcels/{parcelId:guid}/photos", async (
            Guid parcelId,
            IMediator mediator,
            CancellationToken ct,
            string? category = null) =>
            (await mediator.Send(new ListOpsParcelPhotosQuery(parcelId, category), ct)).ToHttpResult())
            .WithName("ListOpsParcelPhotos");

        group.MapPost("/parcels/{parcelId:guid}/photos/upload-ticket", async (
            Guid parcelId,
            CreateOpsPhotoUploadTicketRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new CreateOpsParcelPhotoUploadTicketCommand(
                    parcelId,
                    body.Category,
                    body.FileName,
                    body.ContentType,
                    body.SizeBytes),
                ct)).ToHttpResult())
            .WithName("CreateOpsParcelPhotoUploadTicket");

        group.MapPost("/parcels/{parcelId:guid}/photos/confirm", async (
            Guid parcelId,
            ConfirmOpsPhotoUploadRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new ConfirmOpsParcelPhotoUploadCommand(
                    parcelId,
                    body.PhotoId,
                    body.Category,
                    body.FileName,
                    body.ContentType,
                    body.SizeBytes),
                ct)).ToHttpResult())
            .WithName("ConfirmOpsParcelPhotoUpload");

        group.MapPut("/photos/{photoId:guid}/blob", async (
            Guid photoId,
            HttpRequest request,
            IMediator mediator,
            CancellationToken ct) =>
        {
            await using var stream = request.Body;
            var result = await mediator.Send(new UploadOpsParcelPhotoBytesCommand(photoId, stream), ct);
            return result.ToHttpResult();
        })
            .DisableAntiforgery()
            .WithName("UploadOpsParcelPhotoBlob");

        group.MapPost("/parcels/{parcelId:guid}/photos", async (
            Guid parcelId,
            HttpRequest request,
            IMediator mediator,
            CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { detail = "Photo file is required." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file");
            var category = form["category"].ToString();
            if (string.IsNullOrWhiteSpace(category))
            {
                category = request.Query["category"].ToString();
            }

            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { detail = "Photo file is required." });
            }

            if (string.IsNullOrWhiteSpace(category))
            {
                return Results.BadRequest(new { detail = "Photo category is required." });
            }

            await using var stream = file.OpenReadStream();
            var result = await mediator.Send(
                new UploadOpsParcelPhotoCommand(
                    parcelId,
                    category,
                    file.FileName,
                    file.ContentType,
                    file.Length,
                    stream),
                ct);
            return result.ToHttpResult();
        })
            .DisableAntiforgery()
            .WithName("UploadOpsParcelPhoto");

        group.MapGet("/photos/{photoId:guid}/file", async (Guid photoId, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new DownloadOpsParcelPhotoQuery(photoId), ct);
            if (result.IsFailure)
            {
                return result.ToHttpResult();
            }

            var file = result.Value;
            return Results.File(file.Content, file.ContentType, file.FileName);
        }).WithName("DownloadOpsParcelPhoto");

        group.MapDelete("/photos/{photoId:guid}", async (Guid photoId, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new DeleteOpsParcelPhotoCommand(photoId), ct)).ToHttpResult())
            .WithName("DeleteOpsParcelPhoto");

        group.MapPost("/parcels/{parcelId:guid}/invoice/verify", async (
            Guid parcelId,
            VerifyOpsInvoiceRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new VerifyOpsParcelInvoiceCommand(parcelId, body.Decision, body.Reason),
                ct)).ToHttpResult())
            .WithName("VerifyOpsParcelInvoice");

        group.MapPost("/parcels/{parcelId:guid}/inspection", async (
            Guid parcelId,
            SaveOpsInspectionRequest body,
            IMediator mediator,
            CancellationToken ct) =>
            (await mediator.Send(
                new SaveOpsParcelInspectionCommand(
                    parcelId,
                    body.ConditionStatus,
                    body.WarehouseLocation,
                    body.PackagingType,
                    body.OuterPackagingIntact,
                    body.SealIntact,
                    body.LabelReadable,
                    body.GoodsAsDescribed,
                    body.InspectionNotes,
                    body.InspectedBy),
                ct)).ToHttpResult())
            .WithName("SaveOpsParcelInspection");

        group.MapPost("/quote-queue", async (SendToQuoteQueueRequest body, IMediator mediator, CancellationToken ct) =>
            (await mediator.Send(new SendOpsParcelsToQuoteQueueCommand(body.ParcelIds), ct)).ToHttpResult())
            .WithName("SendOpsParcelsToQuoteQueue");
    }

    private sealed record ReceiveParcelIntakeRequest(
        string SuiteNumber,
        string Retailer,
        string? TrackingNumber,
        string ItemName,
        string Category,
        decimal? DeclaredValueZar,
        string? DimensionsLabel,
        decimal? WeightKg);

    private sealed record VerifyOpsInvoiceRequest(string Decision, string? Reason);

    private sealed record SendParcelInvoiceUploadReminderRequest(bool ForceResend = false);

    private sealed record SaveOpsInspectionRequest(
        string ConditionStatus,
        string? WarehouseLocation,
        string? PackagingType,
        bool OuterPackagingIntact,
        bool SealIntact,
        bool LabelReadable,
        bool GoodsAsDescribed,
        string? InspectionNotes,
        string? InspectedBy);

    private sealed record SendToQuoteQueueRequest(IReadOnlyList<Guid> ParcelIds);

    private sealed record ConfirmSuiteMatchRequest(string SuiteNumber);

    private sealed record AssignExceptionRequest(string AssignedTo);

    private sealed record EscalateExceptionRequest(string EscalatedTo, string? Notes);

    private sealed record ResolveExceptionRequest(string? Notes);

    private sealed record CreateOpsPhotoUploadTicketRequest(
        string Category,
        string FileName,
        string ContentType,
        long SizeBytes);

    private sealed record ConfirmOpsPhotoUploadRequest(
        Guid PhotoId,
        string Category,
        string FileName,
        string ContentType,
        long SizeBytes);
}
