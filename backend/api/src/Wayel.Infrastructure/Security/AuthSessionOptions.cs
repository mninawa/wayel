using System.ComponentModel.DataAnnotations;

namespace Wayel.Infrastructure.Security;

public sealed class AuthSessionOptions
{
    public const string SectionName = "AuthSession";

    [Range(1, 30 * 24 * 60)]
    public int RefreshTokenLifetimeMinutes { get; init; } = 14 * 24 * 60; // 14 days
}
