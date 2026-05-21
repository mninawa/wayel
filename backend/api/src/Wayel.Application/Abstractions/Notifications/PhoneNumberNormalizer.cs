using System.Text;

namespace Wayel.Application.Abstractions.Notifications;

/// <summary>
/// Lightweight E.164 normaliser. We deliberately avoid pulling in
/// libphonenumber for now — most of our recipients are South African (+27)
/// and the few rules we actually need (strip whitespace / hyphens / parens,
/// optional leading "00" instead of "+", min/max length) are easy to keep
/// honest in a single file.
///
/// <para>
/// Rules:
/// </para>
/// <list type="number">
///   <item>Trim and remove every space, hyphen, dot, and parenthesis.</item>
///   <item>If the result starts with <c>00</c>, replace with <c>+</c> (international prefix).</item>
///   <item>If the result starts with <c>0</c> and a default region is configured (e.g. <c>+27</c>),
///         drop the leading zero and prepend the region prefix — that's the
///         common South-African shape "<c>0 21 555 0123</c>".</item>
///   <item>The final value must start with <c>+</c> followed by 8–15 digits
///         (E.164 minimum is 8, max 15 including country code).</item>
/// </list>
/// </summary>
public static class PhoneNumberNormalizer
{
    /// <summary>
    /// Default region prefix applied when callers pass a national-format
    /// number ("0 21 555 0123") without an international prefix. Matches
    /// the operator's country today; once we open up to other markets the
    /// caller can pass an override or we make the default configurable.
    /// </summary>
    public const string DefaultRegionPrefix = "+27";

    public static bool TryNormalizeE164(
        string? input,
        out string normalised,
        string defaultRegionPrefix = DefaultRegionPrefix)
    {
        normalised = string.Empty;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var stripped = StripFormatting(input);
        if (stripped.Length == 0)
        {
            return false;
        }

        if (stripped.StartsWith("00", StringComparison.Ordinal))
        {
            stripped = "+" + stripped[2..];
        }
        else if (stripped.StartsWith('0') && !string.IsNullOrWhiteSpace(defaultRegionPrefix))
        {
            stripped = defaultRegionPrefix + stripped[1..];
        }

        if (!stripped.StartsWith('+'))
        {
            return false;
        }

        var digits = stripped[1..];
        if (digits.Length is < 8 or > 15)
        {
            return false;
        }

        foreach (var ch in digits)
        {
            if (!char.IsDigit(ch))
            {
                return false;
            }
        }

        normalised = stripped;
        return true;
    }

    private static string StripFormatting(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input.Trim())
        {
            if (ch is ' ' or '-' or '.' or '(' or ')')
            {
                continue;
            }

            sb.Append(ch);
        }

        return sb.ToString();
    }
}
