using System.Collections.Concurrent;

namespace Wayel.Bff.Shared.Sessions;

/// <summary>
/// Serializes refresh-token rotations per session within a single BFF process and
/// caches the most recent rotation so sibling requests can pick up the new
/// access token without re-hitting the upstream <c>/auth/refresh</c> endpoint.
///
/// <para>
/// Why this exists: the upstream <c>RefreshAccessTokenCommandHandler</c> treats
/// reuse of an already-consumed refresh token as suspected theft and burns the
/// entire session. That's correct security policy in isolation, but it
/// misclassifies a very ordinary client behaviour: a SPA dashboard firing N
/// parallel API requests when the access token is within the refresh window.
/// All N hit the BFF, all N see the same near-expiry session, all N concurrently
/// call <c>/auth/refresh</c> with the same refresh token. The first wins; the
/// rest get <c>Reused</c> and the BFF cookie is wiped — the user is kicked out
/// mid-work, roughly every <c>AccessTokenLifetimeMinutes</c>.
/// </para>
///
/// <para>
/// The coordinator solves it by giving each sessionId an in-process gate:
///   1. Fast path: if another request rotated the session within the past few
///      seconds and the new access token still has plenty of life left, that
///      cached <see cref="BffSession"/> is returned without acquiring the lock.
///   2. Slow path: the gate's semaphore is taken; the cache is re-checked under
///      the lock (a peer may have rotated while we waited); if it's still stale,
///      a single refresh runs and the result is published to the cache.
/// </para>
///
/// <para>
/// In-process state is fine for a single BFF replica (current Render topology).
/// If we ever go multi-instance, this needs a distributed lock (Redis SET NX),
/// but the bug exists regardless of replica count so the in-process serializer
/// is the right step now and a no-op to remove later.
/// </para>
/// </summary>
public sealed class BffRefreshCoordinator
{
    /// <summary>
    /// Prune trigger. The dictionary holds one entry per active sessionId. At
    /// expected steady state we have at most a few thousand concurrent
    /// customers; this gives plenty of headroom before we bother evicting.
    /// </summary>
    private const int PruneAtSize = 5_000;

    /// <summary>
    /// Entries older than this are evicted during a prune pass. Long enough
    /// that an in-flight long-poll won't lose its gate; short enough that
    /// memory stays bounded if a flood of one-shot sign-ins happens.
    /// </summary>
    private static readonly TimeSpan StaleEntryWindow = TimeSpan.FromMinutes(30);

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    /// <summary>
    /// Coordinate a refresh for <paramref name="sessionId"/>. If a peer recently
    /// rotated the same session and the cached <see cref="BffSession"/> still
    /// satisfies the freshness requirement (its access token has more than
    /// <paramref name="refreshWindow"/> left), that cached session is returned
    /// directly. Otherwise the caller's <paramref name="refreshAsync"/> delegate
    /// is invoked under the per-session lock and its return value cached.
    /// </summary>
    /// <param name="sessionId">The Wayel session id from <see cref="BffSession.SessionId"/>.</param>
    /// <param name="refreshWindow">Same window the middleware uses to decide
    /// "needs refresh" — so a cached session is only considered fresh if it
    /// still has more than <paramref name="refreshWindow"/> of life left.</param>
    /// <param name="refreshAsync">Performs the upstream refresh + cookie write.
    /// Returns the rotated session on success, or <c>null</c> if the upstream
    /// refused. The coordinator only caches successful results.</param>
    /// <param name="cancellationToken">Forwarded to the semaphore wait and the
    /// refresh delegate so a cancelled request doesn't hang waiting on the gate.</param>
    /// <returns>The session that should be used to forward the current request,
    /// or <c>null</c> if the refresh failed (caller signs the cookie out).</returns>
    public async Task<BffSession?> CoordinateRefreshAsync(
        string sessionId,
        TimeSpan refreshWindow,
        Func<CancellationToken, Task<BffSession?>> refreshAsync,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrEmpty(sessionId);
        ArgumentNullException.ThrowIfNull(refreshAsync);

        var entry = _entries.GetOrAdd(sessionId, static _ => new Entry());

        // Fast path: another request rotated this session moments ago and the
        // new token still has comfortable life left. Skip the lock entirely.
        if (TryGetFreshCached(entry, refreshWindow, out var quick))
        {
            return quick;
        }

        await entry.Gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            // Re-check after acquiring the lock — a peer that was ahead of us
            // in the queue may have already rotated.
            if (TryGetFreshCached(entry, refreshWindow, out var underLock))
            {
                return underLock;
            }

            var rotated = await refreshAsync(cancellationToken).ConfigureAwait(false);
            if (rotated is not null)
            {
                entry.MostRecent = rotated;
                entry.LastTouchUtc = DateTime.UtcNow;
            }
            else
            {
                // Wipe any stale cache so a subsequent retry doesn't keep
                // handing out a session whose refresh-token is dead.
                entry.MostRecent = null;
                entry.LastTouchUtc = DateTime.UtcNow;
            }

            MaybePrune();
            return rotated;
        }
        finally
        {
            entry.Gate.Release();
        }
    }

    /// <summary>
    /// Forget any cached session for the given id. Called on explicit sign-out
    /// so a future sign-in of a different user in the same browser doesn't
    /// accidentally pick up the previous session's cached rotation.
    /// </summary>
    public void Invalidate(string sessionId)
    {
        if (string.IsNullOrEmpty(sessionId)) return;
        _entries.TryRemove(sessionId, out _);
    }

    /// <summary>Exposed for diagnostics / tests only.</summary>
    internal int ActiveSessionCount => _entries.Count;

    private static bool TryGetFreshCached(Entry entry, TimeSpan refreshWindow, out BffSession session)
    {
        var cached = entry.MostRecent;
        if (cached is not null && !cached.AccessTokenExpiringWithin(refreshWindow, DateTime.UtcNow))
        {
            session = cached;
            return true;
        }
        session = default!;
        return false;
    }

    private void MaybePrune()
    {
        if (_entries.Count < PruneAtSize) return;
        var cutoff = DateTime.UtcNow - StaleEntryWindow;
        foreach (var kvp in _entries)
        {
            if (kvp.Value.LastTouchUtc < cutoff)
            {
                _entries.TryRemove(kvp.Key, out _);
            }
        }
    }

    private sealed class Entry
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public BffSession? MostRecent { get; set; }
        public DateTime LastTouchUtc { get; set; } = DateTime.UtcNow;
    }
}
