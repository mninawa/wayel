using System.ComponentModel.DataAnnotations;

namespace Wayel.Infrastructure.Security;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required, MinLength(32)]
    public string SigningKey { get; init; } = string.Empty;

    [Required]
    public string Issuer { get; init; } = "wayel-api";

    [Required]
    public string Audience { get; init; } = "wayel-clients";

    [Range(1, 24 * 60)]
    public int AccessTokenLifetimeMinutes { get; init; } = 60;
}
