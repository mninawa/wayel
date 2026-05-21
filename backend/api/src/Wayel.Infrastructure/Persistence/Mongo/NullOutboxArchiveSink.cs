using Microsoft.Extensions.Logging;
using Wayel.Application.Abstractions.Messaging;

namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// No-op archive sink. Used when the host hasn't configured a real long-term
/// store (the default) — in that posture we let the existing TTL do the
/// eviction and accept that terminal rows are not retained beyond the
/// retention window.
///
/// We log at <c>Debug</c> rather than <c>Information</c> because in steady
/// state every successful poll funnels through here and the log would be
/// pure noise; operators who care can flip the level for the namespace.
/// </summary>
internal sealed class NullOutboxArchiveSink(ILogger<NullOutboxArchiveSink> logger) : IOutboxArchiveSink
{
    public Task ArchiveAsync(
        IReadOnlyList<OutboxMessage> messages,
        CancellationToken cancellationToken = default)
    {
        if (messages.Count > 0)
        {
            logger.LogDebug(
                "Discarding {Count} terminal outbox rows (no archive sink configured)",
                messages.Count);
        }

        return Task.CompletedTask;
    }
}
