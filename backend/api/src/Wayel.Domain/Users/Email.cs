using System.Text.RegularExpressions;
using Wayel.Domain.Common;

namespace Wayel.Domain.Users;

/// <summary>
/// Email value object. Normalises (trim + lower-case) and validates against a conservative regex.
/// </summary>
public sealed partial record Email
{
    private static readonly Regex Pattern = EmailRegex();

    private Email(string value) => Value = value;

    public string Value { get; }

    public static Result<Email> Create(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return UserErrors.EmailRequired;
        }

        var normalised = raw.Trim().ToLowerInvariant();
        if (!Pattern.IsMatch(normalised))
        {
            return UserErrors.EmailInvalid;
        }

        return new Email(normalised);
    }

    public override string ToString() => Value;

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 250)]
    private static partial Regex EmailRegex();
}
