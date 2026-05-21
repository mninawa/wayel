using System.Text.Json;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Messaging;
using Wayel.Application.Abstractions.Time;
using Wayel.Domain.Common;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// Polls the outbox collection and publishes any pending domain events
/// through MediatR's <see cref="IPublisher"/>. Events wrapping in a
/// <see cref="DomainEventNotification{TEvent}"/> lets consumers handle
/// them with idiomatic MediatR <see cref="INotificationHandler{TNotification}"/>
/// registrations.
/// </summary>
internal sealed class OutboxDispatcherHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<OutboxOptions> options,
    OutboxDispatcherHeartbeat heartbeat,
    ILogger<OutboxDispatcherHostedService> logger)
    : BackgroundService
{
    private readonly OutboxOptions _options = options.Value;

    // MUST mirror the options used by MongoUnitOfWork on the write side.
    // Web defaults (camelCase + case-insensitive) are required because the
    // outbox payload is serialised camelCase; calling JsonSerializer.Deserialize
    // without these options produces a record whose ctor parameters silently
    // fall back to default(T) — Guid.Empty for IDs, etc.
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Outbox dispatcher starting (poll interval = {Interval}, batch size = {BatchSize})",
            _options.PollInterval,
            _options.BatchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await DispatchBatchAsync(stoppingToken);
                // Heartbeat after every successful tick — even when nothing was
                // available — so "no events for hours" still proves the
                // dispatcher is polling. The readiness probe compares this
                // timestamp against `OutboxOptions.PollInterval`.
                heartbeat.RecordTick(DateTime.UtcNow);
                if (processed == 0)
                {
                    await Task.Delay(_options.PollInterval, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Outbox dispatcher loop encountered an unexpected error. Backing off.");
                // We deliberately do *not* heartbeat on the error path — a
                // dispatcher that's failing on every tick should look unhealthy.
                await Task.Delay(_options.PollInterval, stoppingToken);
            }
        }
    }

    private async Task<int> DispatchBatchAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IOutboxStore>();
        var publisher = scope.ServiceProvider.GetRequiredService<IPublisher>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();

        var pending = await store.GetPendingAsync(_options.BatchSize, cancellationToken);
        if (pending.Count == 0) return 0;

        var processed = 0;
        foreach (var message in pending)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var notification = DeserialiseNotification(message);
                if (notification is null)
                {
                    // Type resolution failures are non-transient — the
                    // assembly name will not appear in this process. Record
                    // a failure and let the DLQ short-circuit kick in.
                    await store.RecordFailureAsync(
                        message.Id,
                        $"Unable to resolve type '{message.AssemblyQualifiedName}'",
                        clock.UtcNow,
                        _options.MaxAttempts,
                        cancellationToken);
                    continue;
                }

                await publisher.Publish(notification, cancellationToken);
                await store.MarkDispatchedAsync(message.Id, clock.UtcNow, cancellationToken);
                processed++;

                // One-line success breadcrumb. We *only* log on
                // dispatch (not on idle ticks) so steady-state is
                // quiet, but every event landing produces a paper
                // trail. Pairs with the "Outbox enqueued …" line in
                // MongoUnitOfWork to make the publish→consume hop
                // visible end-to-end.
                logger.LogInformation(
                    "Outbox dispatched {TypeName} ({MessageId})",
                    message.TypeName,
                    message.Id);
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Failed to dispatch outbox message {MessageId} of type {TypeName} (attempt {Attempt}/{Max})",
                    message.Id,
                    message.TypeName,
                    message.Attempts + 1,
                    _options.MaxAttempts);
                await store.RecordFailureAsync(
                    message.Id,
                    ex.Message,
                    clock.UtcNow,
                    _options.MaxAttempts,
                    cancellationToken);
            }
        }

        return processed;
    }

    private static INotification? DeserialiseNotification(OutboxMessage message)
    {
        var type = Type.GetType(message.AssemblyQualifiedName, throwOnError: false);
        if (type is null) return null;

        var payload = JsonSerializer.Deserialize(message.Payload, type, SerializerOptions);
        if (payload is not IDomainEvent domainEvent) return null;

        var wrapperType = typeof(DomainEventNotification<>).MakeGenericType(type);
        return (INotification?)Activator.CreateInstance(wrapperType, domainEvent);
    }
}

public sealed class OutboxOptions
{
    public const string SectionName = "Outbox";

    public TimeSpan PollInterval { get; init; } = TimeSpan.FromSeconds(2);

    public int BatchSize { get; init; } = 50;

    public bool Enabled { get; init; } = true;

    /// <summary>
    /// Maximum number of dispatch attempts before a message is moved to the
    /// dead-letter state and stops being retried. Defaults to 5 — enough to
    /// ride out transient Mongo / handler hiccups without spinning forever
    /// on a poisoned payload.
    /// </summary>
    public int MaxAttempts { get; init; } = 5;

    /// <summary>
    /// How long successfully dispatched (or dead-lettered) messages are kept
    /// before Mongo's TTL monitor reaps them. Two weeks gives operators
    /// enough room to triage incidents without bloating the collection.
    /// </summary>
    public TimeSpan RetentionAfterTerminal { get; init; } = TimeSpan.FromDays(14);
}
