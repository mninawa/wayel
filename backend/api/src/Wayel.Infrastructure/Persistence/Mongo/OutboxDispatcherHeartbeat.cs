namespace Wayel.Infrastructure.Persistence.Mongo;

/// <summary>
/// In-memory heartbeat the outbox dispatcher updates on every loop
/// iteration. The readiness probe reads it to answer "is the dispatcher
/// still ticking?".
///
/// We intentionally keep it in-memory rather than in Mongo: the readiness
/// probe asks "is *this process* healthy?", and a Mongo round-trip both
/// adds a dependency and obscures cases where the dispatcher is down but
/// the DB is fine.
/// </summary>
public sealed class OutboxDispatcherHeartbeat
{
    private long _lastTickTicks;

    /// <summary>
    /// Latest tick timestamp, or <c>null</c> if the dispatcher hasn't run
    /// yet. Returns UTC.
    /// </summary>
    public DateTime? LastTickUtc
    {
        get
        {
            var ticks = Interlocked.Read(ref _lastTickTicks);
            return ticks == 0 ? null : new DateTime(ticks, DateTimeKind.Utc);
        }
    }

    /// <summary>
    /// Called by the dispatcher after each successful poll (whether or not
    /// any messages were processed). Touch from any thread is safe — the
    /// write is monotonic and order doesn't matter.
    /// </summary>
    public void RecordTick(DateTime nowUtc)
    {
        Interlocked.Exchange(ref _lastTickTicks, nowUtc.Ticks);
    }
}
