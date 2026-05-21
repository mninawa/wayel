using Wayel.Application.Abstractions.Messaging;

namespace Wayel.Application.Features.Auth.Logout;

public sealed record LogoutCommand(string RefreshToken) : ICommand;
