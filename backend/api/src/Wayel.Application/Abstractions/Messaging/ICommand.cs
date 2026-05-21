using MediatR;
using Wayel.Domain.Common;

namespace Wayel.Application.Abstractions.Messaging;

/// <summary>Marker for state-mutating operations.</summary>
public interface ICommand : IRequest<Result>;

/// <summary>Marker for state-mutating operations that produce a typed payload.</summary>
public interface ICommand<TResponse> : IRequest<Result<TResponse>>;

public interface ICommandHandler<in TCommand> : IRequestHandler<TCommand, Result>
    where TCommand : ICommand;

public interface ICommandHandler<in TCommand, TResponse> : IRequestHandler<TCommand, Result<TResponse>>
    where TCommand : ICommand<TResponse>;
