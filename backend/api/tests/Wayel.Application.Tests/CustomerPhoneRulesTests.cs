using Wayel.Application.BorderBox;

namespace Wayel.Application.Tests;

public sealed class CustomerPhoneRulesTests
{
    [Theory]
    [InlineData("+27733039541")]
    [InlineData("+26876909291")]
    [InlineData("0733039541", "+27733039541")]
    [InlineData("076909291", "+26876909291")]
    [InlineData("+27 73 303 9541", "+27733039541")]
    public void TryNormalize_accepts_valid_numbers(string input, string? expected = null)
    {
        var ok = CustomerPhoneRules.TryNormalize(input, out var normalized);
        Assert.True(ok);
        Assert.Equal(expected ?? input, normalized);
    }

    [Theory]
    [InlineData("")]
    [InlineData("0733039541 or")]
    [InlineData("+271234")]
    [InlineData("+26812345")]
    [InlineData("+44 7911 123456")]
    public void TryNormalize_rejects_invalid_numbers(string input)
    {
        Assert.False(CustomerPhoneRules.TryNormalize(input, out _));
    }
}
