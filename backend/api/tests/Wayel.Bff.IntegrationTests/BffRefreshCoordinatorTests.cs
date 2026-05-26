using FluentAssertions;
using Wayel.Bff.Shared.Sessions;

namespace Wayel.Bff.IntegrationTests;

/// <summary>
/// Behavioural contract for <see cref="BffRefreshCoordinator"/>. The coordinator
/// exists to prevent the "N parallel API calls all race to consume the same
/// refresh token" failure mode that the upstream auth service treats as
/// suspected theft (and uses to burn the whole session). The properties
/// covered here are:
///
///   1. A successful rotation publishes its result so peer requests skip the
///      upstream call entirely.
///   2. The cached session is only handed back while it still has plenty of
///      access-token life left — once it crosses back into the refresh
///      window, the next caller does a real rotation.
///   3. Concurrent calls serialize through a single semaphore: even with N
///      simultaneous requests, the upstream sees exactly one rotation.
///   4. A failed rotation invalidates the cache so we don't keep handing out
///      a session whose refresh token is dead.
///   5. <see cref="BffRefreshCoordinator.Invalidate"/> drops the entry on
///      explicit sign-out so the next sign-in starts clean.
/// </summary>
public sealed class BffRefreshCoordinatorTests
{
    private static readonly TimeSpan RefreshWindow = TimeSpan.FromSeconds(120);

    [Fact]
    public async Task Refresh_publishes_rotation_to_subsequent_callers()
    {
        var coordinator = new BffRefreshCoordinator();
        var rotated = MakeSession("user1", lifetime: TimeSpan.FromMinutes(60));
        var upstreamCallCount = 0;

        var first = await coordinator.CoordinateRefreshAsync(
            "sess-A",
            RefreshWindow,
            _ =>
            {
                upstreamCallCount++;
                return Task.FromResult<BffSession?>(rotated);
            },
            CancellationToken.None);

        // A peer request comes in after the rotation finished. The cached
        // session is well outside the refresh window, so it must be returned
        // verbatim and the delegate must NOT run again.
        var second = await coordinator.CoordinateRefreshAsync(
            "sess-A",
            RefreshWindow,
            _ =>
            {
                upstreamCallCount++;
                return Task.FromResult<BffSession?>(throwIfCalled());
            },
            CancellationToken.None);

        first.Should().BeSameAs(rotated);
        second.Should().BeSameAs(rotated);
        upstreamCallCount.Should().Be(1, "the cached rotation must short-circuit peer calls");

        static BffSession throwIfCalled()
            => throw new Xunit.Sdk.XunitException("delegate must not be called when cache is fresh");
    }

    [Fact]
    public async Task Refresh_reruns_when_cached_session_re_enters_window()
    {
        var coordinator = new BffRefreshCoordinator();

        // Seed the cache with a session that's already inside the refresh
        // window — i.e. it has < 120s of access-token life left. The next
        // caller must therefore trigger a real rotation, not return the
        // stale cached value.
        var stale = MakeSession("user1", lifetime: TimeSpan.FromSeconds(30));
        var fresh = MakeSession("user1", lifetime: TimeSpan.FromMinutes(60));

        await coordinator.CoordinateRefreshAsync(
            "sess-B",
            RefreshWindow,
            _ => Task.FromResult<BffSession?>(stale),
            CancellationToken.None);

        var rerun = 0;
        var result = await coordinator.CoordinateRefreshAsync(
            "sess-B",
            RefreshWindow,
            _ =>
            {
                rerun++;
                return Task.FromResult<BffSession?>(fresh);
            },
            CancellationToken.None);

        rerun.Should().Be(1, "stale cached session must not short-circuit the refresh");
        result.Should().BeSameAs(fresh);
    }

    [Fact]
    public async Task Concurrent_callers_serialize_through_a_single_rotation()
    {
        var coordinator = new BffRefreshCoordinator();
        var rotated = MakeSession("user2", lifetime: TimeSpan.FromMinutes(60));

        // The refresh delegate blocks until we release it. That lets us
        // launch N callers, prove they're all stuck behind the first one,
        // then verify only one upstream call ever ran.
        var inflight = new TaskCompletionSource();
        var upstreamCalls = 0;

        async Task<BffSession?> RefreshAsync(CancellationToken _)
        {
            Interlocked.Increment(ref upstreamCalls);
            await inflight.Task;
            return rotated;
        }

        const int parallel = 8;
        var callers = new Task<BffSession?>[parallel];
        for (var i = 0; i < parallel; i++)
        {
            callers[i] = Task.Run(() => coordinator.CoordinateRefreshAsync(
                "sess-C",
                RefreshWindow,
                RefreshAsync,
                CancellationToken.None));
        }

        // Give the scheduler a moment so all callers reach the semaphore.
        // None of them should complete while the delegate is blocked.
        await Task.Delay(50);
        callers.All(t => !t.IsCompleted).Should().BeTrue(
            "all callers must wait until the in-flight rotation finishes");

        inflight.SetResult();
        var results = await Task.WhenAll(callers);

        upstreamCalls.Should().Be(1, "the per-session lock must collapse N parallel callers to one upstream refresh");
        results.Should().AllSatisfy(s => s.Should().BeSameAs(rotated));
    }

    [Fact]
    public async Task Failed_rotation_does_not_poison_the_cache()
    {
        var coordinator = new BffRefreshCoordinator();
        var rotated = MakeSession("user3", lifetime: TimeSpan.FromMinutes(60));

        // First attempt: upstream refuses (e.g. refresh token expired or
        // revoked). Coordinator must return null without caching.
        var firstFailure = await coordinator.CoordinateRefreshAsync(
            "sess-D",
            RefreshWindow,
            _ => Task.FromResult<BffSession?>(null),
            CancellationToken.None);

        firstFailure.Should().BeNull();

        // Second attempt: this time the upstream succeeds. The coordinator
        // must NOT serve the previous (null) result from cache — it must
        // actually invoke the delegate and publish the new session.
        var upstreamCalls = 0;
        var success = await coordinator.CoordinateRefreshAsync(
            "sess-D",
            RefreshWindow,
            _ =>
            {
                upstreamCalls++;
                return Task.FromResult<BffSession?>(rotated);
            },
            CancellationToken.None);

        upstreamCalls.Should().Be(1);
        success.Should().BeSameAs(rotated);
    }

    [Fact]
    public async Task Invalidate_forgets_cached_rotation()
    {
        var coordinator = new BffRefreshCoordinator();
        var first = MakeSession("user4", lifetime: TimeSpan.FromMinutes(60));
        var second = MakeSession("user4-after-sign-in", lifetime: TimeSpan.FromMinutes(60));

        await coordinator.CoordinateRefreshAsync(
            "sess-E",
            RefreshWindow,
            _ => Task.FromResult<BffSession?>(first),
            CancellationToken.None);

        coordinator.Invalidate("sess-E");

        // After invalidation the next caller must run a real rotation; the
        // coordinator must not serve the dropped session from cache.
        var calls = 0;
        var result = await coordinator.CoordinateRefreshAsync(
            "sess-E",
            RefreshWindow,
            _ =>
            {
                calls++;
                return Task.FromResult<BffSession?>(second);
            },
            CancellationToken.None);

        calls.Should().Be(1);
        result.Should().BeSameAs(second);
    }

    private static BffSession MakeSession(string userTag, TimeSpan lifetime)
    {
        var now = DateTime.UtcNow;
        return new BffSession(
            AccessToken: $"access-{userTag}-{Guid.NewGuid():N}",
            AccessTokenExpiresOnUtc: now + lifetime,
            RefreshToken: $"refresh-{userTag}-{Guid.NewGuid():N}",
            RefreshTokenExpiresOnUtc: now + TimeSpan.FromDays(14),
            SessionId: Guid.NewGuid().ToString("N"),
            UserId: Guid.NewGuid(),
            TenantId: null,
            Email: $"{userTag}@test.local",
            DisplayName: userTag,
            Role: "Customer");
    }
}
