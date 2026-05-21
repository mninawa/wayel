namespace Wayel.Application.Abstractions.Security;

/// <summary>
/// Custom JWT claim type names used across both the issuer and the consumer (current-user accessor).
/// </summary>
public static class JwtClaimTypes
{
    public const string TenantId = "tid";

    public const string Role = "role";

    /// <summary>
    /// Optional claim emitted only for <c>UserRole.Partner</c>
    /// sessions. Pins the request to the single
    /// <c>PreferredPartner</c> the user is allowed to author events
    /// against. Absent for every other role.
    /// </summary>
    public const string PreferredPartnerId = "ppid";
}
