using Wayel.Application.Abstractions.Auditing;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Common;

namespace Wayel.Application.Features.OpsAuth;

/// <summary>
/// Lead-only read endpoint for the ops "Recent activity" feed: the latest
/// audit entries across customer-account deletions, KYC reviews, ops user
/// role / invitation changes, etc.
///
/// Thin pass-through over <see cref="IAuditLogReader"/> with one job —
/// flatten the AuditEntry shape into a DTO the SPA can render directly.
/// </summary>
public sealed record ListRecentOpsAuditQuery(
    string? Action = null,
    int PageSize = 20,
    string? ContinuationToken = null) : IQuery<OpsAuditPageDto>;

public sealed record OpsAuditPageDto(
    IReadOnlyList<OpsAuditEntryDto> Items,
    string? NextContinuationToken);

public sealed record OpsAuditEntryDto(
    string Action,
    string Outcome,
    DateTime OccurredOnUtc,
    string? ActorEmail,
    Guid? ActorUserId,
    string? Audience,
    string? Reason,
    IReadOnlyDictionary<string, string?>? Metadata);

internal sealed class ListRecentOpsAuditQueryHandler(
    IAuditLogReader auditReader,
    IOpsCallerContext ops) : IQueryHandler<ListRecentOpsAuditQuery, OpsAuditPageDto>
{
    public async Task<Result<OpsAuditPageDto>> Handle(
        ListRecentOpsAuditQuery request,
        CancellationToken cancellationToken)
    {
        // The activity feed exposes who-did-what across the platform —
        // gate behind the same capability as managing the warehouse team
        // so only leads see it.
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.audit.forbidden",
            "Only leads can view the activity feed.");
        if (denied is not null)
        {
            return denied;
        }

        var pageSize = request.PageSize <= 0 ? 20 : Math.Min(request.PageSize, 100);
        var page = await auditReader.QueryAsync(
            new AuditLogQuery(
                Action: string.IsNullOrWhiteSpace(request.Action) ? null : request.Action,
                PageSize: pageSize,
                ContinuationToken: request.ContinuationToken),
            cancellationToken);

        var items = page.Items
            .Select(e => new OpsAuditEntryDto(
                e.Action,
                e.Outcome.ToString(),
                e.OccurredOnUtc,
                e.ActorEmail,
                e.ActorUserId,
                e.Audience,
                e.Reason,
                e.Metadata))
            .ToList();

        return new OpsAuditPageDto(items, page.NextContinuationToken);
    }
}
