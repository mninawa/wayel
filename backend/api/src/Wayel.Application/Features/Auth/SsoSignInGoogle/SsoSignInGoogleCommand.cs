using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Security;

namespace Wayel.Application.Features.Auth.SsoSignInGoogle;

/// <summary>
/// Exchange a Google id_token for a Wayel auth session.
/// <para>
/// <see cref="Audience"/> identifies which BFF is calling and selects the
/// admission policy (allowlist for admin, open for client/external, etc.).
/// </para>
/// </summary>
public sealed record SsoSignInGoogleCommand(
    string IdToken,
    SsoAudience Audience,
    string? IpAddress,
    string? UserAgent) : ICommand<AuthSession>;
