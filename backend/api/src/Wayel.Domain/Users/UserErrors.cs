using Wayel.Domain.Common;

namespace Wayel.Domain.Users;

public static class UserErrors
{
    public static Error NotFound(UserId id) =>
        Error.NotFound("user.not_found", $"User '{id}' was not found.");

    public static readonly Error EmailRequired =
        Error.Validation("user.email_required", "Email is required.");

    public static readonly Error EmailInvalid =
        Error.Validation("user.email_invalid", "Email is not in a valid format.");

    public static readonly Error EmailTaken =
        Error.Conflict("user.email_taken", "An account with that email already exists.");

    public static readonly Error InvalidCredentials =
        Error.Unauthorized("user.invalid_credentials", "Email or password is incorrect.");

    public static readonly Error Disabled =
        Error.Forbidden("user.disabled", "This account has been disabled.");

    public static readonly Error PasswordTooShort =
        Error.Validation("user.password_too_short", "Password must be at least 12 characters.");
}
