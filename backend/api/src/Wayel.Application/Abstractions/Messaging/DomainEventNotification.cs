using MediatR;
using Wayel.Domain.Common;

namespace Wayel.Application.Abstractions.Messaging;

/// <summary>
/// MediatR notification wrapper around a domain event. Lets handlers stay
/// purely application-layer (no reference to MediatR from the domain) while
/// still benefiting from MediatR's pipeline and DI resolution.
///
/// Owned by the Application layer (rather than Infrastructure) so feature
/// handlers can subscribe to <c>INotificationHandler&lt;DomainEventNotification&lt;X&gt;&gt;</c>
/// without a backward dependency on Infrastructure.
/// </summary>
public sealed record DomainEventNotification<TEvent>(TEvent DomainEvent) : INotification
    where TEvent : IDomainEvent;
