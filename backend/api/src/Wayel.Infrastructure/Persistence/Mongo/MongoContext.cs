using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo;

public sealed class MongoContext
{
    public MongoContext(IOptions<MongoOptions> options, IMongoClient client)
    {
        MongoSerializationRegistry.Initialise();
        Database = client.GetDatabase(options.Value.DatabaseName);
        _options = options.Value;
    }

    private readonly MongoOptions _options;
    public IMongoDatabase Database { get; }

    internal IMongoCollection<UserDocument> Users =>
        Database.GetCollection<UserDocument>(_options.UsersCollection);

    internal IMongoCollection<ExternalIdentityDocument> ExternalIdentities =>
        Database.GetCollection<ExternalIdentityDocument>(_options.ExternalIdentitiesCollection);

    internal IMongoCollection<RefreshTokenDocument> RefreshTokens =>
        Database.GetCollection<RefreshTokenDocument>(_options.RefreshTokensCollection);

    internal IMongoCollection<AuditLogDocument> AuditLog =>
        Database.GetCollection<AuditLogDocument>(_options.AuditLogCollection);

    internal IMongoCollection<OutboxMessageDocument> Outbox =>
        Database.GetCollection<OutboxMessageDocument>(_options.OutboxCollection);

    internal IMongoCollection<SuitePlanDocument> SuitePlans =>
        Database.GetCollection<SuitePlanDocument>(_options.SuitePlansCollection);

    internal IMongoCollection<SuiteSubscriptionDocument> SuiteSubscriptions =>
        Database.GetCollection<SuiteSubscriptionDocument>(_options.SuiteSubscriptionsCollection);

    internal IMongoCollection<CustomerAddressDocument> Addresses =>
        Database.GetCollection<CustomerAddressDocument>(_options.AddressesCollection);

    internal IMongoCollection<ParcelDocument> Parcels =>
        Database.GetCollection<ParcelDocument>(_options.ParcelsCollection);

    internal IMongoCollection<ShipmentDocument> Shipments =>
        Database.GetCollection<ShipmentDocument>(_options.ShipmentsCollection);

    internal IMongoCollection<QuoteDocument> Quotes =>
        Database.GetCollection<QuoteDocument>(_options.QuotesCollection);
}
