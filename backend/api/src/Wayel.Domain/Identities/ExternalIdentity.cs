using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Identities;

/// <summary>
/// A link between a Wayel <see cref="UserId"/> and an external identity provider account.
/// One <see cref="User"/> can have many <see cref="ExternalIdentity"/> rows
/// (e.g. password + Google + Microsoft).
/// </summary>
public sealed class ExternalIdentity : AggregateRoot<ExternalIdentityId>
{
    private ExternalIdentity(
        ExternalIdentityId id,
        UserId userId,
        IdentityProvider provider,
        string providerSubject,
        string emailAtProvider,
        DateTime linkedOnUtc)
        : base(id)
    {
        UserId = userId;
        Provider = provider;
        ProviderSubject = providerSubject;
        EmailAtProvider = emailAtProvider;
        LinkedOnUtc = linkedOnUtc;
    }

    public UserId UserId { get; }

    public IdentityProvider Provider { get; }

    /// <summary>
    /// The stable identifier the provider returns for this user (Google's <c>sub</c>).
    /// Combined with <see cref="Provider"/> this is the lookup key.
    /// </summary>
    public string ProviderSubject { get; }

    public string EmailAtProvider { get; private set; }

    public DateTime LinkedOnUtc { get; }

    public DateTime? LastLoginUtc { get; private set; }

    public static Result<ExternalIdentity> Link(
        UserId userId,
        IdentityProvider provider,
        string providerSubject,
        string emailAtProvider,
        DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(providerSubject))
        {
            return IdentityErrors.SubjectRequired;
        }

        return new ExternalIdentity(
            ExternalIdentityId.New(),
            userId,
            provider,
            providerSubject.Trim(),
            emailAtProvider.Trim().ToLowerInvariant(),
            nowUtc);
    }

    public void RecordLogin(DateTime nowUtc) => LastLoginUtc = nowUtc;

    public void UpdateProviderEmail(string emailAtProvider) =>
        EmailAtProvider = emailAtProvider.Trim().ToLowerInvariant();

    public static ExternalIdentity Rehydrate(
        ExternalIdentityId id,
        UserId userId,
        IdentityProvider provider,
        string providerSubject,
        string emailAtProvider,
        DateTime linkedOnUtc,
        DateTime? lastLoginUtc) => new(id, userId, provider, providerSubject, emailAtProvider, linkedOnUtc)
    {
        LastLoginUtc = lastLoginUtc,
    };
}
