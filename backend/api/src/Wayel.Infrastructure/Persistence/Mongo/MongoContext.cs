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

    internal IMongoCollection<ParcelInvoiceDocument> ParcelInvoices =>
        Database.GetCollection<ParcelInvoiceDocument>(_options.ParcelInvoicesCollection);

    internal IMongoCollection<ShipmentDocument> Shipments =>
        Database.GetCollection<ShipmentDocument>(_options.ShipmentsCollection);

    internal IMongoCollection<QuoteDocument> Quotes =>
        Database.GetCollection<QuoteDocument>(_options.QuotesCollection);

    internal IMongoCollection<SupportTicketDocument> SupportTickets =>
        Database.GetCollection<SupportTicketDocument>(_options.SupportTicketsCollection);

    internal IMongoCollection<SuiteCheckoutPaymentDocument> SuiteCheckoutPayments =>
        Database.GetCollection<SuiteCheckoutPaymentDocument>(_options.SuiteCheckoutPaymentsCollection);

    internal IMongoCollection<QuoteCheckoutPaymentDocument> QuoteCheckoutPayments =>
        Database.GetCollection<QuoteCheckoutPaymentDocument>(_options.QuoteCheckoutPaymentsCollection);

    internal IMongoCollection<QuotePaymentInvoiceDocument> QuotePaymentInvoices =>
        Database.GetCollection<QuotePaymentInvoiceDocument>(_options.QuotePaymentInvoicesCollection);

    internal IMongoCollection<PickupBranchDocument> PickupBranches =>
        Database.GetCollection<PickupBranchDocument>(_options.PickupBranchesCollection);

    internal IMongoCollection<BorderBoxPricingConfigDocument> BorderBoxPricingConfig =>
        Database.GetCollection<BorderBoxPricingConfigDocument>(_options.BorderBoxPricingConfigCollection);

    internal IMongoCollection<SuitePlatformConfigDocument> SuitePlatformConfig =>
        Database.GetCollection<SuitePlatformConfigDocument>(_options.SuitePlatformConfigCollection);

    internal IMongoCollection<ShipmentTrackingEventDocument> ShipmentTrackingEvents =>
        Database.GetCollection<ShipmentTrackingEventDocument>(_options.ShipmentTrackingEventsCollection);

    internal IMongoCollection<ParcelOpsMetadataDocument> ParcelOpsMetadata =>
        Database.GetCollection<ParcelOpsMetadataDocument>(_options.ParcelOpsMetadataCollection);

    internal IMongoCollection<ParcelOpsExceptionDocument> ParcelOpsExceptions =>
        Database.GetCollection<ParcelOpsExceptionDocument>(_options.ParcelOpsExceptionsCollection);

    internal IMongoCollection<ParcelOpsActivityDocument> ParcelOpsActivity =>
        Database.GetCollection<ParcelOpsActivityDocument>(_options.ParcelOpsActivityCollection);

    internal IMongoCollection<ParcelOpsPhotoDocument> ParcelOpsPhotos =>
        Database.GetCollection<ParcelOpsPhotoDocument>(_options.ParcelOpsPhotosCollection);

    internal IMongoCollection<OpsUserDocument> OpsUsers =>
        Database.GetCollection<OpsUserDocument>(_options.OpsUsersCollection);

    internal IMongoCollection<OpsInvitationDocument> OpsInvitations =>
        Database.GetCollection<OpsInvitationDocument>(_options.OpsInvitationsCollection);

    internal IMongoCollection<WarehouseLocationDocument> WarehouseLocations =>
        Database.GetCollection<WarehouseLocationDocument>(_options.WarehouseLocationsCollection);

    internal IMongoCollection<WarehouseMovementDocument> WarehouseMovements =>
        Database.GetCollection<WarehouseMovementDocument>(_options.WarehouseMovementsCollection);

    internal IMongoCollection<PickTaskDocument> PickTasks =>
        Database.GetCollection<PickTaskDocument>(_options.PickTasksCollection);

    internal IMongoCollection<PackingTaskDocument> PackingTasks =>
        Database.GetCollection<PackingTaskDocument>(_options.PackingTasksCollection);

    internal IMongoCollection<DispatchManifestDocument> DispatchManifests =>
        Database.GetCollection<DispatchManifestDocument>(_options.DispatchManifestsCollection);

    internal IMongoCollection<ShipmentCollectionDocument> ShipmentCollections =>
        Database.GetCollection<ShipmentCollectionDocument>(_options.ShipmentCollectionsCollection);

    internal IMongoCollection<KycSubmissionDocument> KycSubmissions =>
        Database.GetCollection<KycSubmissionDocument>(_options.KycSubmissionsCollection);

    internal IMongoCollection<CustomerInAppNotificationDocument> CustomerInAppNotifications =>
        Database.GetCollection<CustomerInAppNotificationDocument>(_options.CustomerInAppNotificationsCollection);

    internal IMongoCollection<KycDocumentUploadSessionDocument> KycDocumentUploadSessions =>
        Database.GetCollection<KycDocumentUploadSessionDocument>(_options.KycDocumentUploadSessionsCollection);

    internal IMongoCollection<OpsPhotoUploadSessionDocument> OpsPhotoUploadSessions =>
        Database.GetCollection<OpsPhotoUploadSessionDocument>(_options.OpsPhotoUploadSessionsCollection);
}
