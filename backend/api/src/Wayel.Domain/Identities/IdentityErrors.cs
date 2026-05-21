using Wayel.Domain.Common;

namespace Wayel.Domain.Identities;

public static class IdentityErrors
{
    public static readonly Error EmailNotVerified =
        Error.Unauthorized("identity.email_not_verified", "The provider has not verified this email address.");

    public static readonly Error ProviderRejected =
        Error.Unauthorized("identity.provider_rejected", "The identity provider rejected this token.");

    public static readonly Error LinkingNotPermitted =
        Error.Forbidden(
            "identity.linking_not_permitted",
            "An account with this email already exists. Sign in with your existing method and link this provider from your settings.");

    public static readonly Error NoTenantClaim =
        Error.Forbidden(
            "identity.no_tenant_claim",
            "No tenant has claimed this email domain. Request an invitation from your administrator.");

    public static readonly Error SubjectRequired =
        Error.Validation("identity.subject_required", "Provider subject is required.");

    public static readonly Error AudienceNotPermitted =
        Error.Forbidden(
            "identity.audience_not_permitted",
            "Your Google account is not permitted to sign in to this portal. Contact your administrator if you believe this is in error.");
}
