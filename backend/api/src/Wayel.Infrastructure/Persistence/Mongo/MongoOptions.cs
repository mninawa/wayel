namespace Wayel.Infrastructure.Persistence.Mongo;

public sealed class MongoOptions
{
    public const string SectionName = "Mongo";

    public string ConnectionString { get; init; } = string.Empty;
    public string DatabaseName { get; init; } = "courier_platform";

    public string UsersCollection { get; init; } = "users";
    public string ExternalIdentitiesCollection { get; init; } = "external_identities";
    public string RefreshTokensCollection { get; init; } = "refresh_tokens";
    public string AuditLogCollection { get; init; } = "audit_log";
    public string OutboxCollection { get; init; } = "outbox";
    public string SuitePlansCollection { get; init; } = "suite_plans";
    public string SuiteSubscriptionsCollection { get; init; } = "suite_subscriptions";
    public string AddressesCollection { get; init; } = "addresses";
    public string ParcelsCollection { get; init; } = "parcels";
    public string ParcelInvoicesCollection { get; init; } = "parcel_invoices";
    public string ShipmentsCollection { get; init; } = "shipments";
    public string QuotesCollection { get; init; } = "quotes";
    public string SupportTicketsCollection { get; init; } = "support_tickets";
    public string SuiteCheckoutPaymentsCollection { get; init; } = "suite_checkout_payments";
    public string QuoteCheckoutPaymentsCollection { get; init; } = "quote_checkout_payments";
    public string QuotePaymentInvoicesCollection { get; init; } = "quote_payment_invoices";
    public string PickupBranchesCollection { get; init; } = "pickup_branches";
    public string BorderBoxPricingConfigCollection { get; init; } = "borderbox_pricing_config";
    public string SuitePlatformConfigCollection { get; init; } = "suite_platform_config";
    public string ShipmentTrackingEventsCollection { get; init; } = "shipment_tracking_events";
    public string ParcelOpsMetadataCollection { get; init; } = "parcel_ops_metadata";
    public string ParcelOpsExceptionsCollection { get; init; } = "parcel_ops_exceptions";
    public string OpsExceptionSupportNotificationsCollection { get; init; } = "ops_exception_support_notifications";
    public string ParcelOpsActivityCollection { get; init; } = "parcel_ops_activity";
    public string CustomerWhatsAppMessagesCollection { get; init; } = "customer_whatsapp_messages";
    public string ParcelOpsPhotosCollection { get; init; } = "parcel_ops_photos";
    public string OpsUsersCollection { get; init; } = "ops_users";
    public string OpsInvitationsCollection { get; init; } = "ops_invitations";
    public string WarehouseLocationsCollection { get; init; } = "warehouse_locations";
    public string WarehouseMovementsCollection { get; init; } = "warehouse_movements";
    public string PickTasksCollection { get; init; } = "warehouse_pick_tasks";
    public string PackingTasksCollection { get; init; } = "warehouse_packing_tasks";
    public string DispatchManifestsCollection { get; init; } = "warehouse_dispatch_manifests";
    public string ShipmentCollectionsCollection { get; init; } = "shipment_collections";
    public string KycSubmissionsCollection { get; init; } = "kyc_submissions";
    public string CustomerInAppNotificationsCollection { get; init; } = "customer_inapp_notifications";
    public string KycDocumentUploadSessionsCollection { get; init; } = "kyc_document_upload_sessions";
    public string OpsPhotoUploadSessionsCollection { get; init; } = "ops_photo_upload_sessions";
    public string PayLaterIntentsCollection { get; init; } = "pay_later_intents";
    public string SuiteNumberPoolCollection { get; init; } = "suite_number_pool";
    public string CustomerSavedCardsCollection { get; init; } = "customer_saved_cards";
    public string PaymentMethodAddIntentsCollection { get; init; } = "payment_method_add_intents";
}
