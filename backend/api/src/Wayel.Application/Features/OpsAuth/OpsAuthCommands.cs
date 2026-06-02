using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Security;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Features.Parcels;
using Wayel.Domain.Common;
namespace Wayel.Application.Features.OpsAuth;

public sealed record OpsSignInGoogleCommand(string IdToken, string? InviteToken = null)
    : ICommand<OpsAuthSessionDto>;

public sealed record OpsAuthSessionDto(
    string AccessToken,
    DateTime ExpiresAtUtc,
    OpsUserDto User,
    IReadOnlyList<string> Capabilities,
    IReadOnlyList<string> Regions);

public sealed record OpsUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    bool IsDisabled,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc,
    IReadOnlyList<string> Regions);

internal sealed class OpsSignInGoogleCommandHandler(
    IGoogleIdTokenValidator googleValidator,
    IOpsUserRepository users,
    IOpsInvitationRepository invitations,
    IOpsJwtTokenIssuer jwt,
    IUnitOfWork unitOfWork,
    IClock clock,
    ILogger<OpsSignInGoogleCommandHandler> logger) : ICommandHandler<OpsSignInGoogleCommand, OpsAuthSessionDto>
{
    public async Task<Result<OpsAuthSessionDto>> Handle(
        OpsSignInGoogleCommand request,
        CancellationToken cancellationToken)
    {
        var validation = await googleValidator.ValidateAsync(request.IdToken, cancellationToken);
        if (validation.IsFailure)
        {
            return Result.Failure<OpsAuthSessionDto>(validation.Error);
        }

        var token = validation.Value;
        if (!token.EmailVerified)
        {
            return Result.Failure<OpsAuthSessionDto>(
                Error.Forbidden("ops.google.email_unverified", "Verify your Google email before signing in."));
        }

        var email = OpsEmailNormalizer.Normalize(token.Email);
        var now = clock.UtcNow;

        var user = await users.GetByGoogleSubjectAsync(token.Subject, cancellationToken)
            ?? await users.GetByEmailAsync(email, cancellationToken);

        if (user is null)
        {
            var invitation = await ResolvePendingInvitationAsync(
                email,
                request.InviteToken,
                cancellationToken);
            if (invitation is null)
            {
                return Result.Failure<OpsAuthSessionDto>(
                    Error.Forbidden(
                        "ops.invitation_required",
                        "Warehouse access is by invitation only. Open your invite link and sign in with the invited Google account."));
            }

            if (invitation.ExpiresAtUtc < now)
            {
                return Result.Failure<OpsAuthSessionDto>(
                    Error.Forbidden(
                        "ops.invitation_expired",
                        "This invitation has expired. Ask a lead for a new invite."));
            }

            var role = NormalizeRole(invitation.Role);
            var regions = OpsRegions.ResolveForRole(role, invitation.Regions);
            user = new OpsUserRecord(
                Guid.NewGuid(),
                email,
                token.Name ?? email,
                role,
                token.Subject,
                false,
                now,
                now,
                regions);

            await users.AddAsync(user, cancellationToken);

            var accepted = invitation with
            {
                Status = "Accepted",
                AcceptedAtUtc = now,
            };
            await invitations.ReplaceAsync(accepted, cancellationToken);
        }
        else
        {
            if (user.IsDisabled)
            {
                return Result.Failure<OpsAuthSessionDto>(
                    Error.Forbidden("ops.user_disabled", "Your warehouse access has been disabled."));
            }

            var displayName = string.IsNullOrWhiteSpace(token.Name) ? user.DisplayName : token.Name!;
            user = user with
            {
                GoogleSubject = user.GoogleSubject ?? token.Subject,
                DisplayName = displayName,
                LastLoginAtUtc = now,
            };
            await users.ReplaceAsync(user, cancellationToken);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Ops Google sign-in for {Email} ({Role})", user.Email, user.Role);

        var effectiveRegions = OpsRegions.ResolveForRole(user.Role, user.Regions);
        var access = jwt.Issue(user.Id, user.Role, user.Email, user.DisplayName, effectiveRegions);
        return new OpsAuthSessionDto(
            access.Token,
            access.ExpiresOnUtc,
            OpsUserMapper.ToDto(user, effectiveRegions),
            OpsPermissions.CapabilitiesFor(user.Role, effectiveRegions),
            effectiveRegions);
    }

    internal static string NormalizeRole(string role)
    {
        var r = role.Trim().ToLowerInvariant();
        return r is "lead" or "finance" or "clerk" or "receiver" or "collector" ? r : "clerk";
    }

    private async Task<OpsInvitationRecord?> ResolvePendingInvitationAsync(
        string email,
        string? inviteToken,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(inviteToken))
        {
            return null;
        }

        var invitation = await invitations.GetByTokenAsync(inviteToken.Trim(), cancellationToken);
        if (invitation is null
            || invitation.Status != "Pending"
            || !string.Equals(invitation.Email, email, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return invitation;
    }
}

public sealed record ListOpsUsersQuery : IQuery<IReadOnlyList<OpsUserDto>>;

internal sealed class ListOpsUsersQueryHandler(IOpsUserRepository users, IOpsCallerContext ops)
    : IQueryHandler<ListOpsUsersQuery, IReadOnlyList<OpsUserDto>>
{
    public async Task<Result<IReadOnlyList<OpsUserDto>>> Handle(
        ListOpsUsersQuery request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can manage warehouse users.");
        if (denied is not null)
        {
            return denied;
        }

        var rows = await users.ListAsync(cancellationToken);
        return rows.Select(u => OpsUserMapper.ToDto(u)).ToList();
    }
}

public sealed record OpsInvitationDto(
    Guid Id,
    string Email,
    string Role,
    IReadOnlyList<string> Regions,
    string Status,
    DateTime ExpiresAtUtc,
    string InvitedByEmail,
    DateTime CreatedAtUtc,
    DateTime? AcceptedAtUtc,
    string? InvitePath);

public sealed record ListOpsInvitationsQuery : IQuery<IReadOnlyList<OpsInvitationDto>>;

internal sealed class ListOpsInvitationsQueryHandler(
    IOpsInvitationRepository invitations,
    IOpsCallerContext ops) : IQueryHandler<ListOpsInvitationsQuery, IReadOnlyList<OpsInvitationDto>>
{
    public async Task<Result<IReadOnlyList<OpsInvitationDto>>> Handle(
        ListOpsInvitationsQuery request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can manage invitations.");
        if (denied is not null)
        {
            return denied;
        }

        var rows = await invitations.ListAsync(cancellationToken);
        return rows.Select(ToDto).ToList();
    }

    internal static OpsInvitationDto ToDto(OpsInvitationRecord row) =>
        new(
            row.Id,
            row.Email,
            row.Role,
            OpsRegions.ResolveForRole(row.Role, row.Regions),
            row.Status,
            row.ExpiresAtUtc,
            row.InvitedByEmail,
            row.CreatedAtUtc,
            row.AcceptedAtUtc,
            row.Status == "Pending" ? $"/?invite={row.Token}" : null);
}

public sealed record CreateOpsInvitationCommand(string Email, string Role, IReadOnlyList<string> Regions)
    : ICommand<OpsInvitationDto>;

internal sealed class CreateOpsInvitationCommandHandler(
    IOpsInvitationRepository invitations,
    IOpsUserRepository users,
    IOpsCallerContext ops,
    IUnitOfWork unitOfWork,
    IClock clock) : ICommandHandler<CreateOpsInvitationCommand, OpsInvitationDto>
{
    public async Task<Result<OpsInvitationDto>> Handle(
        CreateOpsInvitationCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can invite warehouse users.");
        if (denied is not null)
        {
            return denied;
        }

        var email = OpsEmailNormalizer.Normalize(request.Email);
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            return Error.Validation("ops.invite.invalid_email", "Enter a valid email address.");
        }

        var existingUser = await users.GetByEmailAsync(email, cancellationToken);
        if (existingUser is not null && !existingUser.IsDisabled)
        {
            return Error.Validation("ops.invite.user_exists", "This person already has warehouse access.");
        }

        var pending = await invitations.GetPendingByEmailAsync(email, cancellationToken);
        if (pending is not null)
        {
            return Error.Validation("ops.invite.already_pending", "An invitation is already pending for this email.");
        }

        var role = OpsSignInGoogleCommandHandler.NormalizeRole(request.Role);
        var regions = OpsRegions.Normalize(request.Regions);
        if (regions.Count == 0)
        {
            regions = OpsRegions.ResolveForRole(role, null);
        }

        var now = clock.UtcNow;
        var record = new OpsInvitationRecord(
            Guid.NewGuid(),
            email,
            role,
            regions,
            OpsInvitationTokens.New(),
            "Pending",
            now.AddDays(14),
            ops.Actor,
            now,
            null);

        await invitations.AddAsync(record, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return ListOpsInvitationsQueryHandler.ToDto(record);
    }

}

public static class OpsInvitationTokens
{
    public static string New() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
}

public sealed record RevokeOpsInvitationCommand(Guid InvitationId) : ICommand;

internal sealed class RevokeOpsInvitationCommandHandler(
    IOpsInvitationRepository invitations,
    IOpsCallerContext ops,
    IUnitOfWork unitOfWork) : ICommandHandler<RevokeOpsInvitationCommand>
{
    public async Task<Result> Handle(RevokeOpsInvitationCommand request, CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can revoke invitations.");
        if (denied is not null)
        {
            return denied;
        }

        var row = await invitations.GetByIdAsync(request.InvitationId, cancellationToken);
        if (row is null)
        {
            return Error.NotFound("ops.invite.not_found", "Invitation not found.");
        }

        if (row.Status != "Pending")
        {
            return Error.Validation("ops.invite.not_pending", "Only pending invitations can be revoked.");
        }

        await invitations.ReplaceAsync(row with { Status = "Revoked" }, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public sealed record UpdateOpsUserRoleCommand(Guid UserId, string Role, IReadOnlyList<string>? Regions = null)
    : ICommand<OpsUserDto>;

internal sealed class UpdateOpsUserRoleCommandHandler(
    IOpsUserRepository users,
    IOpsCallerContext ops,
    IUnitOfWork unitOfWork) : ICommandHandler<UpdateOpsUserRoleCommand, OpsUserDto>
{
    public async Task<Result<OpsUserDto>> Handle(
        UpdateOpsUserRoleCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can change roles.");
        if (denied is not null)
        {
            return Result.Failure<OpsUserDto>(denied);
        }

        var user = await users.GetByIdAsync(request.UserId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("ops.user.not_found", "User not found.");
        }

        var role = OpsSignInGoogleCommandHandler.NormalizeRole(request.Role);
        var regions = request.Regions is { Count: > 0 }
            ? OpsRegions.Normalize(request.Regions)
            : OpsRegions.ResolveForRole(role, user.Regions);
        var updated = user with { Role = role, Regions = regions };
        await users.ReplaceAsync(updated, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return OpsUserMapper.ToDto(updated);
    }
}

public sealed record SetOpsUserDisabledCommand(Guid UserId, bool IsDisabled) : ICommand<OpsUserDto>;

internal sealed class SetOpsUserDisabledCommandHandler(
    IOpsUserRepository users,
    IOpsCallerContext ops,
    IUnitOfWork unitOfWork) : ICommandHandler<SetOpsUserDisabledCommand, OpsUserDto>
{
    public async Task<Result<OpsUserDto>> Handle(
        SetOpsUserDisabledCommand request,
        CancellationToken cancellationToken)
    {
        var denied = OpsPermissions.Require(
            OpsPermissions.CanManageTeam(ops.Role),
            "ops.team.forbidden",
            "Only leads can disable users.");
        if (denied is not null)
        {
            return Result.Failure<OpsUserDto>(denied);
        }

        var user = await users.GetByIdAsync(request.UserId, cancellationToken);
        if (user is null)
        {
            return Error.NotFound("ops.user.not_found", "User not found.");
        }

        var updated = user with { IsDisabled = request.IsDisabled };
        await users.ReplaceAsync(updated, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return OpsUserMapper.ToDto(updated);
    }
}

public sealed record PreviewOpsInvitationQuery(string Token) : IQuery<OpsInvitationPreviewDto>;

public sealed record OpsInvitationPreviewDto(
    string Email,
    string Role,
    IReadOnlyList<string> Regions,
    DateTime ExpiresAtUtc,
    bool IsValid);

internal sealed class PreviewOpsInvitationQueryHandler(
    IOpsInvitationRepository invitations,
    IClock clock) : IQueryHandler<PreviewOpsInvitationQuery, OpsInvitationPreviewDto>
{
    public async Task<Result<OpsInvitationPreviewDto>> Handle(
        PreviewOpsInvitationQuery request,
        CancellationToken cancellationToken)
    {
        var row = await invitations.GetByTokenAsync(request.Token.Trim(), cancellationToken);
        if (row is null)
        {
            return Error.NotFound("ops.invite.not_found", "Invitation not found.");
        }

        var valid = row.Status == "Pending" && row.ExpiresAtUtc >= clock.UtcNow;
        return new OpsInvitationPreviewDto(
            row.Email,
            row.Role,
            OpsRegions.ResolveForRole(row.Role, row.Regions),
            row.ExpiresAtUtc,
            valid);
    }
}

internal static class OpsUserMapper
{
    internal static OpsUserDto ToDto(OpsUserRecord user, IReadOnlyList<string>? regions = null) =>
        new(
            user.Id,
            user.Email,
            user.DisplayName,
            user.Role,
            user.IsDisabled,
            user.CreatedAtUtc,
            user.LastLoginAtUtc,
            regions ?? OpsRegions.ResolveForRole(user.Role, user.Regions));
}
