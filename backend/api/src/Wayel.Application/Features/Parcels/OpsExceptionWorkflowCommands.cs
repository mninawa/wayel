using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;
using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

public sealed record GetOpsAccessQuery : IQuery<OpsAccessDto>;

public sealed record OpsAccessDto(string Role, string Actor, IReadOnlyList<string> Capabilities);

internal sealed class GetOpsAccessQueryHandler(IOpsCallerContext ops)
    : IQueryHandler<GetOpsAccessQuery, OpsAccessDto>
{
    public Task<Result<OpsAccessDto>> Handle(GetOpsAccessQuery request, CancellationToken cancellationToken)
    {
        if (!ops.IsOps)
        {
            return Task.FromResult<Result<OpsAccessDto>>(
                Error.Unauthorized("ops.required", "Ops authentication required."));
        }

        return Task.FromResult<Result<OpsAccessDto>>(
            new OpsAccessDto(ops.Role, ops.Actor, OpsPermissions.CapabilitiesFor(ops.Role)));
    }
}

public sealed record AssignOpsExceptionCommand(
    Guid ParcelId,
    string ExceptionType,
    string AssignedTo) : ICommand<OpsExceptionWorkflowResultDto>;

public sealed record EscalateOpsExceptionCommand(
    Guid ParcelId,
    string ExceptionType,
    string EscalatedTo,
    string? Notes) : ICommand<OpsExceptionWorkflowResultDto>;

public sealed record ResolveOpsExceptionCommand(
    Guid ParcelId,
    string ExceptionType,
    string? Notes) : ICommand<OpsExceptionWorkflowResultDto>;

public sealed record OpsExceptionWorkflowResultDto(
    Guid ParcelId,
    string ExceptionType,
    string Status,
    string? AssignedTo,
    string? EscalatedTo,
    DateTime? DueAtUtc,
    bool IsOverdue,
    string Message);

internal sealed class AssignOpsExceptionCommandHandler(
    IParcelRepository parcels,
    IParcelOpsExceptionRepository workflows,
    IParcelOpsActivityRepository activities,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<AssignOpsExceptionCommand, OpsExceptionWorkflowResultDto>
{
    public async Task<Result<OpsExceptionWorkflowResultDto>> Handle(
        AssignOpsExceptionCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageExceptions(ops.Role),
            "ops.exceptions.forbidden",
            "Only warehouse leads can assign exceptions.");
        if (denied is not null)
        {
            return denied;
        }

        return await OpsExceptionWorkflowHandlers.UpsertAsync(
            request.ParcelId,
            request.ExceptionType,
            "IN_PROGRESS",
            request.AssignedTo.Trim(),
            null,
            null,
            parcels,
            workflows,
            activities,
            supportNotifications: null,
            ops,
            clock,
            unitOfWork,
            $"Assigned to {request.AssignedTo.Trim()}.",
            cancellationToken);
    }
}

internal sealed class EscalateOpsExceptionCommandHandler(
    IParcelOpsExceptionRepository workflows,
    IParcelOpsActivityRepository activities,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<EscalateOpsExceptionCommand, OpsExceptionWorkflowResultDto>
{
    public async Task<Result<OpsExceptionWorkflowResultDto>> Handle(
        EscalateOpsExceptionCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageExceptions(ops.Role),
            "ops.exceptions.forbidden",
            "Only warehouse leads can escalate exceptions.");
        if (denied is not null)
        {
            return denied;
        }

        var now = clock.UtcNow;
        var parcelId = new ParcelId(request.ParcelId);
        var existing = await workflows.GetAsync(parcelId, request.ExceptionType, cancellationToken);
        var workflow = new ParcelOpsExceptionWorkflow(
            parcelId,
            request.ExceptionType.Trim().ToUpperInvariant(),
            "ESCALATED",
            existing?.AssignedTo,
            request.EscalatedTo.Trim(),
            request.Notes,
            existing?.DueAtUtc,
            now,
            now);

        await workflows.UpsertAsync(workflow, cancellationToken);
        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "EXCEPTION_ESCALATED",
            $"Exception escalated · {workflow.ExceptionType}",
            $"Escalated to {workflow.EscalatedTo}",
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return OpsExceptionWorkflowHandlers.ToResult(workflow, now, $"Escalated to {workflow.EscalatedTo}.");
    }
}

internal sealed class ResolveOpsExceptionCommandHandler(
    IParcelRepository parcels,
    IParcelOpsExceptionRepository workflows,
    IParcelOpsActivityRepository activities,
    IOpsExceptionSupportNotificationRepository supportNotifications,
    IOpsCallerContext ops,
    IClock clock,
    IUnitOfWork unitOfWork) : ICommandHandler<ResolveOpsExceptionCommand, OpsExceptionWorkflowResultDto>
{
    public async Task<Result<OpsExceptionWorkflowResultDto>> Handle(
        ResolveOpsExceptionCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageExceptions(ops.Role),
            "ops.exceptions.forbidden",
            "Only warehouse leads can resolve exceptions.");
        if (denied is not null)
        {
            return denied;
        }

        return await OpsExceptionWorkflowHandlers.UpsertAsync(
            request.ParcelId,
            request.ExceptionType,
            "RESOLVED",
            null,
            null,
            request.Notes,
            parcels,
            workflows,
            activities,
            supportNotifications,
            ops,
            clock,
            unitOfWork,
            "Exception marked resolved.",
            cancellationToken);
    }
}

internal static class OpsExceptionWorkflowHandlers
{
    internal static async Task<Result<OpsExceptionWorkflowResultDto>> UpsertAsync(
        Guid parcelIdValue,
        string exceptionType,
        string status,
        string? assignedTo,
        string? escalatedTo,
        string? notes,
        IParcelRepository parcels,
        IParcelOpsExceptionRepository workflows,
        IParcelOpsActivityRepository activities,
        IOpsExceptionSupportNotificationRepository? supportNotifications,
        IOpsCallerContext ops,
        IClock clock,
        IUnitOfWork unitOfWork,
        string message,
        CancellationToken cancellationToken)
    {
        var parcelId = new ParcelId(parcelIdValue);
        var parcel = await parcels.GetByIdAsync(parcelId, cancellationToken);
        if (parcel is null)
        {
            return Error.NotFound("parcel.not_found", "Parcel not found.");
        }

        var type = exceptionType.Trim().ToUpperInvariant();
        var existing = await workflows.GetAsync(parcelId, type, cancellationToken);
        var severity = OpsExceptionRules.DetectSeverity(type);
        var dueAt = existing?.DueAtUtc ?? OpsExceptionSla.DueAtUtc(parcel.ReceivedAtUtc, severity);
        var now = clock.UtcNow;

        var workflow = new ParcelOpsExceptionWorkflow(
            parcelId,
            type,
            status,
            assignedTo ?? existing?.AssignedTo,
            escalatedTo ?? existing?.EscalatedTo,
            notes ?? existing?.Notes,
            dueAt,
            existing?.EscalatedAtUtc,
            now);

        await workflows.UpsertAsync(workflow, cancellationToken);
        if (string.Equals(status, "RESOLVED", StringComparison.OrdinalIgnoreCase)
            && supportNotifications is not null)
        {
            await supportNotifications.ClearAsync(parcelId, type, cancellationToken);
        }

        await OpsParcelActivityWriter.LogAsync(
            activities,
            parcelId,
            "EXCEPTION_UPDATED",
            $"Exception {status.ToLowerInvariant()} · {type}",
            message,
            ops.Actor,
            now,
            cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ToResult(workflow, now, message);
    }

    internal static OpsExceptionWorkflowResultDto ToResult(
        ParcelOpsExceptionWorkflow workflow,
        DateTime nowUtc,
        string message) =>
        new(
            workflow.ParcelId.Value,
            workflow.ExceptionType,
            workflow.Status,
            workflow.AssignedTo,
            workflow.EscalatedTo,
            workflow.DueAtUtc,
            OpsExceptionSla.IsOverdue(workflow.DueAtUtc, workflow.Status, nowUtc),
            message);
}
