using Wayel.Domain.Common;

namespace Wayel.Domain.Sessions;

public static class RefreshTokenErrors
{
    public static readonly Error NotFound =
        Error.Unauthorized("refresh_token.not_found", "Refresh token is invalid or has been revoked.");

    public static readonly Error Expired =
        Error.Unauthorized("refresh_token.expired", "Refresh token has expired. Please sign in again.");

    public static readonly Error Revoked =
        Error.Unauthorized("refresh_token.revoked", "Refresh token has been revoked.");

    public static readonly Error Reused =
        Error.Unauthorized(
            "refresh_token.reused",
            "Refresh token reuse detected. The session has been revoked as a precaution.");
}
