using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Notifications;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.BorderBox;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Warehouse;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Parcels;

public sealed record ReceiveParcelCommand(
    string SuiteNumber,
    string Retailer,
    string? TrackingNumber,
    string ItemName,
    string Category,
    decimal? DeclaredValueZar,
    string? DimensionsLabel,
    decimal? WeightKg) : ICommand<ReceiveParcelResultDto>;

public sealed record ReceiveParcelResultDto(
    Guid ParcelId,
    string SuiteNumber,
    string CustomerEmail,
    string CustomerDisplayName,
    string? TrackingNumber,
    string ItemName,
    string Status,
    DateTime ReceivedAtUtc);

internal sealed class ReceiveParcelCommandHandler(
    IUserRepository users,
    ISuiteSubscriptionRepository subscriptions,
    IParcelRepository parcels,
    IParcelOpsActivityRepository activities,
    IWarehouseLocationRepository locations,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork,
    IBorderBoxWhatsAppNotifier whatsApp,
    IBorderBoxInAppNotifier inApp) : ICommandHandler<ReceiveParcelCommand, ReceiveParcelResultDto>
{
    public async Task<Result<ReceiveParcelResultDto>> Handle(
        ReceiveParcelCommand request,
        CancellationToken cancellationToken)
    {
        if (ops.IsOps)
        {
            var denied = OpsPermissions.Require(
                OpsPermissions.CanIntake(ops.Role),
                "ops.intake.forbidden",
                "Your role cannot receive parcels.");
            if (denied is not null)
            {
                return denied;
            }
        }

        if (string.IsNullOrWhiteSpace(request.SuiteNumber))
        {
            return Error.Validation("parcel.suite_required", "Suite number is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Retailer) ||
            string.IsNullOrWhiteSpace(request.ItemName) ||
            string.IsNullOrWhiteSpace(request.Category))
        {
            return Error.Validation("parcel.fields_required", "Retailer, item name, and category are required.");
        }

        var subscription = await subscriptions.GetBySuiteNumberAsync(request.SuiteNumber, cancellationToken);
        if (subscription is null || string.IsNullOrWhiteSpace(subscription.SuiteNumber))
        {
            return Error.NotFound("parcel.suite_not_found", "No active suite subscription for this suite number.");
        }

        var user = await users.GetByIdAsync(subscription.UserId, cancellationToken);
        if (user is null)
        {
            return UserErrors.NotFound(subscription.UserId);
        }

        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        if (!caps.CanReceiveParcels)
        {
            return Error.Validation("parcel.receive_blocked", caps.CustomerMessage);
        }

        await SuiteLocationProvisioner.EnsureAsync(subscription.SuiteNumber, locations, clock, cancellationToken);

        var tracking = string.IsNullOrWhiteSpace(request.TrackingNumber)
            ? null
            : request.TrackingNumber.Trim();

        if (!string.IsNullOrEmpty(tracking))
        {
            var existing = await parcels.ListForUserAsync(user.Id, cancellationToken);
            if (existing.Any(p =>
                    string.Equals(p.TrackingNumber, tracking, StringComparison.OrdinalIgnoreCase)))
            {
                return Error.Conflict(
                    "parcel.tracking_duplicate",
                    "A parcel with this tracking number is already on file for this customer.");
            }
        }

        var parcel = Parcel.Receive(
            user.Id,
            subscription.SuiteNumber,
            request.Retailer.Trim(),
            tracking,
            request.ItemName.Trim(),
            request.Category.Trim(),
            request.DeclaredValueZar,
            string.IsNullOrWhiteSpace(request.DimensionsLabel) ? null : request.DimensionsLabel.Trim(),
            request.WeightKg,
            ParcelStatus.Received);

        await parcels.AddAsync(parcel, cancellationToken);
        if (ops.IsOps)
        {
            await OpsParcelActivityWriter.LogAsync(
                activities,
                parcel.Id,
                "PARCEL_RECEIVED",
                "Parcel received at warehouse",
                $"{parcel.Retailer} · {parcel.ItemName}",
                ops.Actor,
                clock.UtcNow,
                cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        await whatsApp.NotifyParcelReceivedUploadInvoiceAsync(
            user,
            parcel.Id.Value,
            parcel.SuiteNumber,
            parcel.ItemName,
            parcel.TrackingNumber,
            cancellationToken);

        await inApp.NotifyParcelReceivedUploadInvoiceAsync(
            user,
            parcel.Id.Value,
            parcel.SuiteNumber,
            parcel.ItemName,
            parcel.TrackingNumber,
            cancellationToken);

        return new ReceiveParcelResultDto(
            parcel.Id.Value,
            parcel.SuiteNumber,
            user.Email.Value,
            user.DisplayName,
            parcel.TrackingNumber,
            parcel.ItemName,
            parcel.Status.ToString(),
            parcel.ReceivedAtUtc);
    }
}
