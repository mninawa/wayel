namespace Wayel.Infrastructure.Security;

/// <summary>
/// Reads claim values out of <see cref="Microsoft.IdentityModel.Tokens.TokenValidationResult.Claims"/>,
/// which is a <see cref="System.Collections.Generic.IDictionary{TKey, TValue}"/> of
/// <c>string</c> → <c>object</c> where the value's runtime type follows the JSON it came from
/// (booleans → <see cref="bool"/>, integers → <see cref="long"/>, strings → <see cref="string"/>, etc.).
///
/// A naïve <c>value as string</c> silently returns <c>null</c> for any non-string claim. That is
/// the bug that previously caused every Google sign-in to be flagged as
/// <c>email_verified = false</c>; the helpers here exist so the coercion has a single,
/// well-tested implementation.
/// </summary>
internal static class GoogleClaimReader
{
    public static string? ReadString(IDictionary<string, object> claims, string name)
    {
        if (claims is null)
        {
            return null;
        }

        if (!claims.TryGetValue(name, out var value) || value is null)
        {
            return null;
        }

        return value switch
        {
            string s => s,
            _ => value.ToString(),
        };
    }

    public static bool ReadBool(IDictionary<string, object> claims, string name)
    {
        if (claims is null || !claims.TryGetValue(name, out var value) || value is null)
        {
            return false;
        }

        return value switch
        {
            bool b => b,
            string s => bool.TryParse(s, out var parsed) && parsed,
            _ => bool.TryParse(value.ToString(), out var parsed) && parsed,
        };
    }
}
