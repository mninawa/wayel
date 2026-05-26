using System.Text.RegularExpressions;
using FluentAssertions;
using Wayel.Application.BorderBox;
using Wayel.Domain.Quotes;

namespace Wayel.Application.Tests;

/// <summary>
/// Regression coverage for the <c>Duplicate Transaction Reference</c> error
/// Paystack returned whenever a customer retried a failed/abandoned
/// initiate. The old reference builders were fully deterministic from
/// (suiteNumber, completedCount) and (quoteId, attemptCount), so the second
/// attempt produced the exact same string and Paystack refused it. These
/// tests pin the contract that every call now produces a fresh reference.
/// </summary>
public sealed class CheckoutReferenceBuildersTests
{
    [Fact]
    public void Suite_paystack_reference_is_unique_per_call()
    {
        // 50 back-to-back calls is far more than a real customer would ever
        // do, but it's a tight cap on a bug that previously bit on the SECOND
        // call. A failure here means we're back to deterministic refs.
        const int trials = 50;
        var refs = Enumerable.Range(0, trials)
            .Select(_ => SuiteCheckoutBilling.BuildPaystackReference("WY-1234ABCD", completedPaymentCount: 0))
            .ToHashSet(StringComparer.Ordinal);

        refs.Count.Should().Be(trials, "every Paystack initiate must produce a fresh reference");
        refs.Should().AllSatisfy(r => r.Should().StartWith("WY-1234ABCD-"));
        refs.Should().AllSatisfy(r => r.Length.Should().BeLessThanOrEqualTo(100, "Paystack caps references at 100 chars"));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(5)]
    public void Suite_paystack_reference_keeps_renewal_marker_for_ops_triage(int completed)
    {
        var reference = SuiteCheckoutBilling.BuildPaystackReference("WY-1234ABCD", completed);

        reference.Should().StartWith($"WY-1234ABCD-R{completed + 1}-");
    }

    [Fact]
    public void Suite_paystack_reference_uses_only_paystack_safe_characters()
    {
        // Paystack accepts [A-Z a-z 0-9 - _ .] and refuses the rest with a
        // less-obvious 400. Random salt is hex so it's safe by construction,
        // but the contract guard protects future callers from passing a raw
        // suite number with spaces / slashes etc.
        var reference = SuiteCheckoutBilling.BuildPaystackReference("WY 12/34 ABCD", completedPaymentCount: 0);

        Regex.IsMatch(reference, @"^[A-Za-z0-9\-_\.]+$").Should().BeTrue(
            $"reference '{reference}' must use only Paystack-safe characters");
    }

    [Fact]
    public void Suite_momo_reference_is_a_fresh_v4_guid_per_call()
    {
        const int trials = 50;
        var refs = Enumerable.Range(0, trials)
            .Select(_ => SuiteCheckoutBilling.BuildMomoReference())
            .ToHashSet(StringComparer.Ordinal);

        refs.Count.Should().Be(trials);
        refs.Should().AllSatisfy(r =>
            Guid.TryParse(r, out _).Should().BeTrue($"MoMo expects a parseable UUID, got '{r}'"));
    }

    [Fact]
    public void Quote_paystack_reference_is_unique_per_call()
    {
        var quoteId = new QuoteId(Guid.NewGuid());
        const int trials = 50;

        var refs = Enumerable.Range(0, trials)
            .Select(_ => QuoteCheckoutBilling.BuildPaystackReference(quoteId))
            .ToHashSet(StringComparer.Ordinal);

        refs.Count.Should().Be(trials, "every quote-payment initiate must produce a fresh reference");
        refs.Should().AllSatisfy(r => r.Should().StartWith("QUO-"));
        refs.Should().AllSatisfy(r => r.Length.Should().BeLessThanOrEqualTo(100));
    }

    [Fact]
    public void Quote_paystack_reference_embeds_the_quote_id_prefix_for_traceability()
    {
        var quoteId = new QuoteId(Guid.Parse("11111111-2222-3333-4444-555555555555"));

        var reference = QuoteCheckoutBilling.BuildPaystackReference(quoteId);

        // First 8 hex chars of the quote id (uppercased).
        reference.Should().StartWith("QUO-11111111-");
    }

    [Fact]
    public void Quote_momo_reference_is_a_fresh_v4_guid_per_call()
    {
        const int trials = 50;
        var refs = Enumerable.Range(0, trials)
            .Select(_ => QuoteCheckoutBilling.BuildMomoReference())
            .ToHashSet(StringComparer.Ordinal);

        refs.Count.Should().Be(trials);
        refs.Should().AllSatisfy(r => Guid.TryParse(r, out _).Should().BeTrue());
    }
}
