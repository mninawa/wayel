namespace Wayel.Infrastructure.Persistence.Mongo;

public sealed class MongoOptions
{
    public const string SectionName = "Mongo";

    public string ConnectionString { get; init; } = string.Empty;
    public string DatabaseName { get; init; } = "borderbox";

    public string UsersCollection { get; init; } = "users";
    public string ExternalIdentitiesCollection { get; init; } = "external_identities";
    public string RefreshTokensCollection { get; init; } = "refresh_tokens";
    public string AuditLogCollection { get; init; } = "audit_log";
    public string OutboxCollection { get; init; } = "outbox";
    public string SuitePlansCollection { get; init; } = "suite_plans";
    public string SuiteSubscriptionsCollection { get; init; } = "suite_subscriptions";
    public string AddressesCollection { get; init; } = "addresses";
    public string ParcelsCollection { get; init; } = "parcels";
    public string ShipmentsCollection { get; init; } = "shipments";
    public string QuotesCollection { get; init; } = "quotes";
}
