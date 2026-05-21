namespace Wayel.Application.Configuration;

/// <summary>
/// Per-audience SSO admission rules. Bound from the <c>Auth:Sso</c> configuration
/// section. Empty lists mean "no rule of this kind" (not "deny everything"); the
/// final allow/deny decision is made by combining rules per audience.
/// </summary>
public sealed class SsoAdmissionOptions
{
    public const string SectionName = "Auth:Sso";

    /// <summary>
    /// Rules for the REMOVED audience. Admission = (email matches
    /// <see cref="AdminPortalOptions.AllowedEmails"/>) OR (email's domain matches
    /// <see cref="AdminPortalOptions.AllowedDomains"/>) OR (a non-expired pending
    /// staff invitation exists for the email).
    /// </summary>
    public AdminPortalOptions AdminPortal { get; init; } = new();

    /// <summary>
    /// Emails that get auto-promoted to <c>SuperAdmin</c> on first sign-in
    /// (case-insensitive). Use this to bootstrap the very first super-admin
    /// without having to touch the database. These emails are also implicitly
    /// allowed into the admin portal even if not in <see cref="AdminPortalOptions.AllowedEmails"/>.
    /// </summary>
    public IReadOnlyList<string> BootstrapSuperAdmins { get; init; } = [];

    /// <summary>
    /// Per-tenant admin bootstrap list. When an email here completes Google
    /// SSO via the <c>SsoAudience.Client</c> audience (the staff
    /// portal), the user is auto-promoted to <c>TenantAdmin</c> and bound
    /// to the configured tenant. This is the supported path for getting a
    /// fresh dev environment past the "no staff exists yet" cold-start
    /// without having to manually mint and accept a staff invitation.
    ///
    /// <para>
    /// Idempotent: re-listing an email here that's already bound to the
    /// configured tenant is a no-op. Re-listing an email that's already
    /// a SuperAdmin leaves the role alone (super-admin outranks tenant
    /// admin). Re-listing under a different tenant id will be rejected
    /// at promotion time by the User aggregate (tenant binding is
    /// immutable once set).
    /// </para>
    ///
    /// <para>
    /// IMPORTANT — single-role caveat: today the User aggregate stores a
    /// single <c>Role</c>, so promoting an existing <c>Parent</c> account
    /// here will overwrite that role. If you want to keep using the same
    /// Google account in both the parent (External) and staff (Client)
    /// portals, use a different email for staff bootstrap until multi-role
    /// support lands.
    /// </para>
    /// </summary>
    public IReadOnlyList<BootstrapTenantAdminEntry> BootstrapTenantAdmins { get; init; } = [];

    public sealed class AdminPortalOptions
    {
        public IReadOnlyList<string> AllowedEmails { get; init; } = [];

        public IReadOnlyList<string> AllowedDomains { get; init; } = [];
    }

    /// <summary>
    /// One entry in the <see cref="BootstrapTenantAdmins"/> list: the
    /// email to auto-promote and the tenant id the user should be bound
    /// to on first staff-portal sign-in.
    /// </summary>
    public sealed class BootstrapTenantAdminEntry
    {
        /// <summary>Case-insensitive email match against the SSO id token.</summary>
        public string Email { get; init; } = string.Empty;

        /// <summary>
        /// Tenant the user should be bound to. Must reference an existing
        /// tenant in the <c>tenants</c> collection — the SSO admission
        /// policy doesn't create tenants, it only binds users.
        /// </summary>
        public Guid TenantId { get; init; }
    }
}
