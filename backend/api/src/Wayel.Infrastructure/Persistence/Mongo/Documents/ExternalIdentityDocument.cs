using Wayel.Domain.Identities;
using Wayel.Domain.Users;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class ExternalIdentityDocument
{
    public ExternalIdentityId Id { get; set; }
    public UserId UserId { get; set; }
    public IdentityProvider Provider { get; set; }
    public string ProviderSubject { get; set; } = string.Empty;
    public string EmailAtProvider { get; set; } = string.Empty;
    public DateTime LinkedOnUtc { get; set; }
    public DateTime? LastLoginUtc { get; set; }

    public static ExternalIdentityDocument FromDomain(ExternalIdentity identity) => new()
    {
        Id = identity.Id,
        UserId = identity.UserId,
        Provider = identity.Provider,
        ProviderSubject = identity.ProviderSubject,
        EmailAtProvider = identity.EmailAtProvider,
        LinkedOnUtc = identity.LinkedOnUtc,
        LastLoginUtc = identity.LastLoginUtc,
    };

    public ExternalIdentity ToDomain() => ExternalIdentity.Rehydrate(
        Id, UserId, Provider, ProviderSubject, EmailAtProvider, LinkedOnUtc, LastLoginUtc);
}
