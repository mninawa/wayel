using FluentAssertions;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Domain.Users;

namespace Wayel.Application.Tests;

/// <summary>
/// Pins the candidate ladder used by the suite-number allocator's
/// UserIdSuffix mode. The first candidate is the "natural" timestamp-prefix
/// slice every customer normally gets; subsequent candidates are emergency
/// fallbacks for the rare collision window (two sign-ups within ~65 seconds
/// share the leading 32 bits of a UUID v7).
///
/// <para>The contract these tests defend:
/// <list type="number">
///   <item>First candidate always uses the leading hex slice — visible suite
///   numbers stay deterministic for the 99% case.</item>
///   <item>Second candidate uses the trailing slice — UUID v7's tail is fully
///   random, so this is the effective collision stopper.</item>
///   <item>The format (PREFIX-HEX, fixed width) is identical across the
///   whole ladder so an operator looking at a member's address can't tell
///   whether they got their primary or fallback candidate.</item>
/// </list></para>
/// </summary>
public sealed class SuiteNumberCandidateTests
{
    private static SuitePlatformSettings DefaultSettings(
        string prefix = "ES",
        int suffixLength = 8) =>
        new(
            RegionCode: "SZ",
            WarehouseName: "WeYell Hub",
            AddressLine1: "1 Rivonia Rd",
            AddressLine2: null,
            City: "Sandton",
            Province: "Gauteng",
            PostalCode: "2196",
            CountryCode: "ZA",
            TotalSuiteCapacity: 10_000,
            NumberPrefix: prefix,
            GenerationMode: SuiteNumberGenerationMode.UserIdSuffix,
            UserIdSuffixLength: suffixLength,
            SequencePadLength: 6,
            NextSequenceNumber: 1,
            IsActive: true,
            UpdatedAtUtc: DateTime.UtcNow);

    [Fact]
    public void First_candidate_uses_leading_hex_slice_for_clean_display()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(prefix: "ES", suffixLength: 8);

        var first = SuiteNumberAllocator.EnumerateUserIdCandidates(settings, userId).First();

        first.Should().Be("ES-019E4AE2",
            "the user-visible suite number should match the natural leading slice of the UUID");
    }

    [Fact]
    public void Prefix_and_hex_are_uppercased_so_addresses_look_consistent()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(prefix: "  bw  ", suffixLength: 8);

        var first = SuiteNumberAllocator.EnumerateUserIdCandidates(settings, userId).First();

        first.Should().Be("BW-019E4AE2");
    }

    [Theory]
    [InlineData(4, "ES-019E")]
    [InlineData(6, "ES-019E4A")]
    [InlineData(8, "ES-019E4AE2")]
    [InlineData(12, "ES-019E4AE2DAA6")]
    public void Suffix_length_controls_hex_slice_width(int suffixLength, string expected)
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(suffixLength: suffixLength);

        var first = SuiteNumberAllocator.EnumerateUserIdCandidates(settings, userId).First();

        first.Should().Be(expected);
    }

    [Fact]
    public void Suffix_length_is_clamped_between_4_and_16_to_prevent_unusable_addresses()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));

        SuiteNumberAllocator.EnumerateUserIdCandidates(DefaultSettings(suffixLength: 1), userId)
            .First().Should().HaveLength("ES-".Length + 4, "lower clamp keeps a minimum 4 hex chars");
        SuiteNumberAllocator.EnumerateUserIdCandidates(DefaultSettings(suffixLength: 99), userId)
            .First().Should().HaveLength("ES-".Length + 16, "upper clamp caps at 16 hex chars");
    }

    [Fact]
    public void Second_candidate_uses_trailing_slice_so_collision_recovery_keeps_the_format()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(prefix: "ES", suffixLength: 8);

        var candidates = SuiteNumberAllocator.EnumerateUserIdCandidates(settings, userId).Take(2).ToList();

        candidates[0].Should().Be("ES-019E4AE2");
        candidates[1].Should().Be("ES-4FB26BDB",
            "trailing slice taps the high-entropy random tail of the UUID v7");
    }

    [Fact]
    public void All_candidates_share_the_prefix_and_have_the_same_width()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(prefix: "ES", suffixLength: 8);

        var candidates = SuiteNumberAllocator
            .EnumerateUserIdCandidates(settings, userId)
            .Take(5)
            .ToList();

        candidates.Should().AllSatisfy(c => c.Should().StartWith("ES-"));
        candidates.Should().AllSatisfy(c => c.Should().HaveLength("ES-".Length + 8));
    }

    [Fact]
    public void Candidates_after_the_primary_are_distinct_so_collision_retries_always_make_progress()
    {
        var userId = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var settings = DefaultSettings(prefix: "ES", suffixLength: 8);

        var candidates = SuiteNumberAllocator
            .EnumerateUserIdCandidates(settings, userId)
            .Take(4)
            .ToList();

        candidates.Distinct().Should().HaveCount(candidates.Count,
            "if the retry loop kept proposing the same number we'd infinite-loop against a stable collision");
    }

    [Fact]
    public void Two_users_in_the_same_time_window_share_the_primary_but_diverge_on_the_fallback()
    {
        // Both UUIDs are crafted to share the leading 8 hex chars (same ~65s
        // window for UUID v7) but differ everywhere after — this is exactly
        // the collision pattern the pool's hex rotation is designed to break.
        var alice = new UserId(Guid.Parse("019e4ae2-daa6-7d77-b052-41ec4fb26bdb"));
        var bob = new UserId(Guid.Parse("019e4ae2-aaaa-7d77-b052-aaaaaaaaaaaa"));
        var settings = DefaultSettings(prefix: "ES", suffixLength: 8);

        var aliceCandidates = SuiteNumberAllocator
            .EnumerateUserIdCandidates(settings, alice).Take(2).ToList();
        var bobCandidates = SuiteNumberAllocator
            .EnumerateUserIdCandidates(settings, bob).Take(2).ToList();

        aliceCandidates[0].Should().Be(bobCandidates[0],
            "this is the realistic collision case — the bug we're guarding against");
        aliceCandidates[1].Should().NotBe(bobCandidates[1],
            "the trailing slice (random portion of UUID v7) must disambiguate");
    }
}
