namespace Wayel.Application.Abstractions.Persistence;

public interface IOpsUserRepository
{
    Task<OpsUserRecord?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<OpsUserRecord?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<OpsUserRecord?> GetByGoogleSubjectAsync(string googleSubject, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OpsUserRecord>> ListAsync(CancellationToken cancellationToken = default);
    Task AddAsync(OpsUserRecord user, CancellationToken cancellationToken = default);
    Task ReplaceAsync(OpsUserRecord user, CancellationToken cancellationToken = default);
}

public sealed record OpsUserRecord(
    Guid Id,
    string Email,
    string DisplayName,
    string Role,
    string? GoogleSubject,
    bool IsDisabled,
    DateTime CreatedAtUtc,
    DateTime? LastLoginAtUtc);
