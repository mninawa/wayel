using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Security;

namespace Wayel.Application.Features.Auth.RefreshAccessToken;

public sealed record RefreshAccessTokenCommand(
    string RefreshToken,
    string? IpAddress,
    string? UserAgent) : ICommand<AuthSession>;
