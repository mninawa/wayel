using Wayel.Domain.Common;

namespace Wayel.Application.Abstractions.Security;

public interface IGoogleIdTokenValidator
{
    Task<Result<GoogleIdToken>> ValidateAsync(string rawIdToken, CancellationToken cancellationToken);
}

/// <summary>Validated payload from a Google id_token. Subject (sub) is the lookup key.</summary>
public sealed record GoogleIdToken(
    string Subject,
    string Email,
    bool EmailVerified,
    string? Name,
    string? PictureUrl,
    string? HostedDomain);
