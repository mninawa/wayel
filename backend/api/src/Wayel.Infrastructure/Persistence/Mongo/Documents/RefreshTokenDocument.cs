using Wayel.Domain.Sessions;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class RefreshTokenDocument
{
    public RefreshTokenId Id { get; set; }
    public UserId UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public DateTime IssuedOnUtc { get; set; }
    public DateTime ExpiresOnUtc { get; set; }
    public DateTime? ConsumedOnUtc { get; set; }
    public DateTime? RevokedOnUtc { get; set; }
    public RefreshTokenId? ReplacedByTokenId { get; set; }
    public string? CreatedByIp { get; set; }
    public string? UserAgent { get; set; }

    public static RefreshTokenDocument FromDomain(RefreshToken token) => new()
    {
        Id = token.Id,
        UserId = token.UserId,
        TokenHash = token.TokenHash,
        SessionId = token.SessionId,
        IssuedOnUtc = token.IssuedOnUtc,
        ExpiresOnUtc = token.ExpiresOnUtc,
        ConsumedOnUtc = token.ConsumedOnUtc,
        RevokedOnUtc = token.RevokedOnUtc,
        ReplacedByTokenId = token.ReplacedByTokenId,
        CreatedByIp = token.CreatedByIp,
        UserAgent = token.UserAgent,
    };

    public RefreshToken ToDomain() => RefreshToken.Rehydrate(
        Id, UserId, TokenHash, SessionId, IssuedOnUtc, ExpiresOnUtc,
        ConsumedOnUtc, RevokedOnUtc, ReplacedByTokenId, CreatedByIp, UserAgent);
}
