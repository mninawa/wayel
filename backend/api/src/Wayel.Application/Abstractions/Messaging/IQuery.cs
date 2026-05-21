using MediatR;
using Wayel.Domain.Common;

namespace Wayel.Application.Abstractions.Messaging;

/// <summary>Marker for read-only operations.</summary>
public interface IQuery<TResponse> : IRequest<Result<TResponse>>;

public interface IQueryHandler<in TQuery, TResponse> : IRequestHandler<TQuery, Result<TResponse>>
    where TQuery : IQuery<TResponse>;
