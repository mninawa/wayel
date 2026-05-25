namespace Wayel.Infrastructure.Notifications;

internal static class WhatsAppPhoneNormalizer
{
    /// <summary>Best-effort E.164 for WasenderAPI (defaults ZA when no country code).</summary>
    public static string? ToE164(string? raw, string defaultCountryCode = "27")
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.Length < 9)
        {
            return null;
        }

        if (raw.TrimStart().StartsWith('+'))
        {
            return "+" + digits;
        }

        if (digits.StartsWith(defaultCountryCode, StringComparison.Ordinal))
        {
            return "+" + digits;
        }

        if (digits.StartsWith('0') && digits.Length >= 10)
        {
            return "+" + defaultCountryCode + digits[1..];
        }

        return "+" + defaultCountryCode + digits;
    }
}
