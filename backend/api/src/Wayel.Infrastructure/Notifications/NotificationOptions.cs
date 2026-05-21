namespace Wayel.Infrastructure.Notifications;

/// <summary>
/// Configuration knobs for outbound notifications. Today only the invitation
/// "accept" URL is templated, but this class is the natural home for SMTP
/// credentials, sender identity, and per-tenant template overrides.
/// </summary>
public sealed class NotificationOptions
{
    public const string SectionName = "Notifications";

    /// <summary>
    /// Default base URL of the SPA "accept invitation" page. The token is
    /// appended as a <c>?token=</c> query parameter. Example for dev:
    /// <c>http://localhost:4200/invitations/accept</c>.
    ///
    /// This default is used whenever <see cref="AcceptUrlBaseByRole"/> doesn't
    /// match the invitation's role.
    /// </summary>
    public string? AcceptUrlBase { get; init; }

    /// <summary>
    /// Per-role overrides for the accept URL base. Keys are role names
    /// (case-insensitive, matching the .NET <c>UserRole</c> enum:
    /// <c>SuperAdmin</c>, <c>TenantAdmin</c>, <c>Staff</c>, <c>Parent</c>).
    ///
    /// This lets one host route different invitations into different SPAs:
    /// e.g. <c>TenantAdmin</c> → admin portal, <c>Staff</c> → client portal,
    /// <c>Parent</c> → external client. When a role isn't listed here we
    /// fall back to <see cref="AcceptUrlBase"/>.
    /// </summary>
    public IDictionary<string, string> AcceptUrlBaseByRole { get; init; } =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves the configured base URL for the given role. Falls back to
    /// <see cref="AcceptUrlBase"/> when no role-specific override exists.
    /// Returns <c>null</c> when no base is configured at all (e.g. tests
    /// that don't care about the link).
    /// </summary>
    public string? ResolveAcceptUrlBase(string role)
    {
        if (!string.IsNullOrWhiteSpace(role) &&
            AcceptUrlBaseByRole.TryGetValue(role, out var perRole) &&
            !string.IsNullOrWhiteSpace(perRole))
        {
            return perRole;
        }

        return string.IsNullOrWhiteSpace(AcceptUrlBase) ? null : AcceptUrlBase;
    }
}
