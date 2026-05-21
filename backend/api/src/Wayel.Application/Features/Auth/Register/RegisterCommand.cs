using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Security;

namespace Wayel.Application.Features.Auth.Register;

/// <summary>Self-service customer registration for the WeYell portal.</summary>
public sealed record RegisterCommand(
    string Email,
    string Password,
    string DisplayName,
    string? Phone,
    string Role,
    string? IpAddress,
    string? UserAgent) : ICommand<AuthSession>;
