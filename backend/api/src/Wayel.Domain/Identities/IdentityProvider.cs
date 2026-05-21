namespace Wayel.Domain.Identities;

/// <summary>
/// External identity provider. <see cref="Password"/> is treated as one of the providers
/// so account-linking and audit logs are uniform across all sign-in methods.
/// </summary>
public enum IdentityProvider
{
    Unknown = 0,
    Password = 1,
    Google = 2,
    Microsoft = 3,
    Apple = 4,
}
