using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.BorderBox;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record ConfirmParcelSuiteMatchCommand(Guid ParcelId, string SuiteNumber)
    : ICommand<ConfirmParcelSuiteMatchResultDto>;

public sealed record ConfirmParcelSuiteMatchResultDto(
    Guid ParcelId,
    string SuiteNumber,
    string CustomerDisplayName,
    string SuiteMatchStatus,
    string Message);

internal sealed class ConfirmParcelSuiteMatchCommandHandler(
    IParcelRepository parcels,
    ISuiteSubscriptionRepository subscriptions,
    IUserRepository users,
    IParcelOpsActivityRepository activities,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ConfirmParcelSuiteMatchCommand, ConfirmParcelSuiteMatchResultDto>
{
    public async Task<Result<ConfirmParcelSuiteMatchResultDto>> Handle(
        ConfirmParcelSuiteMatchCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageExceptions(ops.Role) || OpsPermissions.CanIntake(ops.Role),
            "ops.match.forbidden",
            "Your role cannot confirm suite matches.");
        if (denied is not null)
        {
            return denied;
        }

        var parcelId = new ParcelId(request.ParcelId);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        if (string.IsNullOrWhiteSpace(request.SuiteNumber))
        {
            return Error.Validation("suite.required", "Suite number is required.");
        }

        var subscription = await subscriptions.GetBySuiteNumberAsync(request.SuiteNumber, cancellationToken);
        if (subscription is null || string.IsNullOrWhiteSpace(subscription.SuiteNumber))
        {
            return Error.NotFound("suite.not_found", "No customer found for that suite number.");
        }

        var caps = SuiteAccessEvaluator.Evaluate(subscription, clock.UtcNow);
        if (!caps.CanReceiveParcels)
        {
            return Error.Validation("suite.inactive", caps.CustomerMessage);
        }

        var link = parcel.LinkToCustomer(subscription.UserId, subscription.SuiteNumber);
        if (link.IsFailure)
        {
            return link.Error;
        }

        await parcels.UpdateAsync(parcel, cancellationToken);
        var now = clock.UtcNow;
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "SUITE_MATCHED",
            "Suite match confirmed",
            $"Suite {parcel.SuiteNumber}",
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        var user = await users.GetByIdAsync(subscription.UserId, cancellationToken);
        var matchStatus = string.IsNullOrWhiteSpace(parcel.TrackingNumber) ? "Partial Match" : "Match";

        return new ConfirmParcelSuiteMatchResultDto(
            parcel.Id.Value,
            parcel.SuiteNumber,
            user?.DisplayName ?? "Customer",
            matchStatus,
            $"Parcel linked to suite {parcel.SuiteNumber}.");
    }
}
