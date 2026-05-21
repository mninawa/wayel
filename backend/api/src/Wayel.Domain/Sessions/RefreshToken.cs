using System.Security.Cryptography;
using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Sessions;

/// <summary>
/// A single refresh token in a rotating chain. We persist only the SHA-256 hash of the
/// raw token, never the token itself. Rotation: when a refresh succeeds we mark this row
/// as <see cref="ConsumedOnUtc"/> and link <see cref="ReplacedByTokenId"/> to the new row.
/// If a *consumed* token is presented again we treat it as theft and revoke the whole chain.
/// </summary>
public sealed class RefreshToken : AggregateRoot<RefreshTokenId>
{
    private RefreshToken(
        RefreshTokenId id,
        UserId userId,
        string tokenHash,
        string sessionId,
        DateTime issuedOnUtc,
        DateTime expiresOnUtc,
        string? createdByIp,
        string? userAgent)
        : base(id)
    {
        UserId = userId;
        TokenHash = tokenHash;
        SessionId = sessionId;
        IssuedOnUtc = issuedOnUtc;
        ExpiresOnUtc = expiresOnUtc;
        CreatedByIp = createdByIp;
        UserAgent = userAgent;
    }

    public UserId UserId { get; }

    public string TokenHash { get; }

    /// <summary>
    /// Stable id grouping every token in a single sign-in chain. Used for "revoke whole session"
    /// and reuse-detection cascading.
    /// </summary>
    public string SessionId { get; }

    public DateTime IssuedOnUtc { get; }

    public DateTime ExpiresOnUtc { get; }

    public DateTime? ConsumedOnUtc { get; private set; }

    public DateTime? RevokedOnUtc { get; private set; }

    public RefreshTokenId? ReplacedByTokenId { get; private set; }

    public string? CreatedByIp { get; }

    public string? UserAgent { get; }

    public bool IsActive => ConsumedOnUtc is null && RevokedOnUtc is null;

    public bool IsConsumed => ConsumedOnUtc is not null;

    public bool IsExpired(DateTime nowUtc) => nowUtc >= ExpiresOnUtc;

    public static RefreshToken Issue(
        UserId userId,
        string rawToken,
        string sessionId,
        DateTime nowUtc,
        TimeSpan lifetime,
        string? createdByIp = null,
        string? userAgent = null) => new(
            RefreshTokenId.New(),
            userId,
            HashToken(rawToken),
            sessionId,
            nowUtc,
            nowUtc.Add(lifetime),
            createdByIp,
            userAgent);

    public void Consume(RefreshTokenId replacedBy, DateTime nowUtc)
    {
        ConsumedOnUtc = nowUtc;
        ReplacedByTokenId = replacedBy;
    }

    public void Revoke(DateTime nowUtc)
    {
        if (RevokedOnUtc is null)
        {
            RevokedOnUtc = nowUtc;
        }
    }

    /// <summary>SHA-256 of the URL-safe base64 token. Lower-case hex.</summary>
    public static string HashToken(string rawToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawToken);
        var bytes = System.Text.Encoding.UTF8.GetBytes(rawToken);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Generates a 256-bit cryptographically random token, base64url-encoded.
    /// Caller must transmit it to the client exactly once and store only the hash.
    /// </summary>
    public static string GenerateRawToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Base64Url.Encode(bytes);
    }

    public static RefreshToken Rehydrate(
        RefreshTokenId id,
        UserId userId,
        string tokenHash,
        string sessionId,
        DateTime issuedOnUtc,
        DateTime expiresOnUtc,
        DateTime? consumedOnUtc,
        DateTime? revokedOnUtc,
        RefreshTokenId? replacedByTokenId,
        string? createdByIp,
        string? userAgent) => new(id, userId, tokenHash, sessionId, issuedOnUtc, expiresOnUtc, createdByIp, userAgent)
    {
        ConsumedOnUtc = consumedOnUtc,
        RevokedOnUtc = revokedOnUtc,
        ReplacedByTokenId = replacedByTokenId,
    };

    private static class Base64Url
    {
        public static string Encode(ReadOnlySpan<byte> bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
