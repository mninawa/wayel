namespace Wayel.Application.Abstractions.Persistence;

public interface IOpsInvitationRepository
{
    Task<OpsInvitationRecord?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<OpsInvitationRecord?> GetByTokenAsync(string token, CancellationToken cancellationToken = default);
    Task<OpsInvitationRecord?> GetPendingByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OpsInvitationRecord>> ListAsync(CancellationToken cancellationToken = default);
    Task AddAsync(OpsInvitationRecord invitation, CancellationToken cancellationToken = default);
    Task ReplaceAsync(OpsInvitationRecord invitation, CancellationToken cancellationToken = default);
}

public sealed record OpsInvitationRecord(
    Guid Id,
    string Email,
    string Role,
    string Token,
    string Status,
    DateTime ExpiresAtUtc,
    string InvitedByEmail,
    DateTime CreatedAtUtc,
    DateTime? AcceptedAtUtc);
