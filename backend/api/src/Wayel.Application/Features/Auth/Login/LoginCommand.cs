using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Security;

namespace Wayel.Application.Features.Auth.Login;

public sealed record LoginCommand(
    string Email,
    string Password,
    string? IpAddress,
    string? UserAgent) : ICommand<AuthSession>;
