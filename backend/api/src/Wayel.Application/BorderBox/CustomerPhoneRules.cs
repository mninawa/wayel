using System.Text;
using System.Text.RegularExpressions;

namespace Wayel.Application.BorderBox;

/// <summary>
/// Customer profile phone numbers: one mobile only, South Africa (+27) or Eswatini (+268).
/// </summary>
public static partial class CustomerPhoneRules
{
    public const string ValidationMessage =
        "Enter one mobile number in international format: +27 followed by 9 digits (South Africa) or +268 followed by 8 digits (Eswatini).";

    public static bool TryNormalize(string? input, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(input) || ContainsLetters(input))
        {
            return false;
        }

        var stripped = StripToDigitsAndPlus(input);
        if (stripped.Length == 0)
        {
            return false;
        }

        stripped = ApplyLocalPrefixes(stripped);

        if (SouthAfricaPattern().IsMatch(stripped) || EswatiniPattern().IsMatch(stripped))
        {
            normalized = stripped;
            return true;
        }

        return false;
    }

    private static string StripToDigitsAndPlus(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var ch in input.Trim())
        {
            if (char.IsDigit(ch))
            {
                sb.Append(ch);
            }
            else if (ch == '+' && sb.Length == 0)
            {
                sb.Append(ch);
            }
        }

        return sb.ToString();
    }

    private static string ApplyLocalPrefixes(string stripped)
    {
        if (stripped.StartsWith("00", StringComparison.Ordinal))
        {
            return "+" + stripped[2..];
        }

        if (stripped.StartsWith('+'))
        {
            return stripped;
        }

        // South Africa: 0 + 9 subscriber digits
        if (stripped.StartsWith('0') && stripped.Length == 10)
        {
            return "+27" + stripped[1..];
        }

        if (stripped.StartsWith("27", StringComparison.Ordinal) && stripped.Length == 11)
        {
            return "+" + stripped;
        }

        // Eswatini: 0 + 8 subscriber digits
        if (stripped.StartsWith('0') && stripped.Length == 9)
        {
            return "+268" + stripped[1..];
        }

        if (stripped.StartsWith("268", StringComparison.Ordinal) && stripped.Length == 11)
        {
            return "+" + stripped;
        }

        if (stripped.Length == 9 && stripped[0] is '6' or '7' or '8')
        {
            return "+27" + stripped;
        }

        if (stripped.Length == 8 && stripped[0] == '7')
        {
            return "+268" + stripped;
        }

        return stripped;
    }

    [GeneratedRegex(@"^\+27\d{9}$")]
    private static partial Regex SouthAfricaPattern();

    [GeneratedRegex(@"^\+268\d{8}$")]
    private static partial Regex EswatiniPattern();

    private static bool ContainsLetters(string input)
    {
        foreach (var ch in input)
        {
            if (char.IsLetter(ch))
            {
                return true;
            }
        }

        return false;
    }
}
