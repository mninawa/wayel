using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.Parcels;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

/// <summary>
/// MongoDB-backed cascade eraser. Walks every collection that holds rows
/// owned by a customer — directly (UserId) or transitively (Parcel/Shipment/
/// Quote IDs) — and deletes them in dependency order so foreign-key-style
/// references never dangle mid-cascade.
///
/// Best-effort: a failure deleting one collection logs + continues so we
/// don't leave the user half-erased. The AuditLog collection is intentionally
/// preserved.
/// </summary>
internal sealed class MongoCustomerAccountEraser(
    MongoContext context,
    ILogger<MongoCustomerAccountEraser> logger) : ICustomerAccountEraser
{
    public async Task<CustomerEraseReport> EraseAsync(UserId userId, CancellationToken cancellationToken = default)
    {
        var userGuid = userId.Value;

        // -----------------------------------------------------------------
        // Snapshot every transitive owner ID we'll need *before* we start
        // deleting (some dependents only carry the parcel/shipment/quote id,
        // not the user id, so once the roots are gone we can't find them).
        // -----------------------------------------------------------------
        var parcelDocs = await context.Parcels
            .Find(Builders<ParcelDocument>.Filter.Eq(p => p.UserId, userId))
            .Project(p => p.Id)
            .ToListAsync(cancellationToken);
        var parcelIds = parcelDocs.ToArray();
        var parcelGuids = parcelIds.Select(p => p.Value).ToArray();

        var shipmentDocs = await context.Shipments
            .Find(Builders<ShipmentDocument>.Filter.Eq(s => s.UserId, userId))
            .Project(s => s.Id)
            .ToListAsync(cancellationToken);
        var shipmentIds = shipmentDocs.ToArray();
        var shipmentGuids = shipmentIds.Select(s => s.Value).ToArray();

        var quoteDocs = await context.Quotes
            .Find(Builders<QuoteDocument>.Filter.Eq(q => q.UserId, userId))
            .Project(q => q.Id)
            .ToListAsync(cancellationToken);
        var quoteIds = quoteDocs.ToArray();
        var quoteGuids = quoteIds.Select(q => q.Value).ToArray();

        // -----------------------------------------------------------------
        // Per-parcel dependents
        // -----------------------------------------------------------------
        var parcelInvoices = await DeleteByParcelIdAsync(
            context.ParcelInvoices, x => x.ParcelId, parcelIds, cancellationToken);
        var parcelOpsMetadata = await DeleteByParcelIdAsync(
            context.ParcelOpsMetadata, x => x.ParcelId, parcelIds, cancellationToken);
        var parcelOpsExceptions = await DeleteByParcelIdAsync(
            context.ParcelOpsExceptions, x => x.ParcelId, parcelIds, cancellationToken);
        var parcelOpsActivity = await DeleteByParcelIdAsync(
            context.ParcelOpsActivity, x => x.ParcelId, parcelIds, cancellationToken);
        var parcelOpsPhotos = await DeleteByParcelIdAsync(
            context.ParcelOpsPhotos, x => x.ParcelId, parcelIds, cancellationToken);

        var opsPhotoSessions = await DeleteByGuidAsync(
            context.OpsPhotoUploadSessions, x => x.ParcelId, parcelGuids, cancellationToken);

        var warehouseMovements = await DeleteByGuidAsync(
            context.WarehouseMovements, x => x.ParcelId, parcelGuids, cancellationToken);

        var quoteParcels = context.Database.GetCollection<QuoteParcelDocument>("quote_parcels");
        var quoteParcelDeletes = await DeleteByParcelIdAsync(
            quoteParcels, x => x.ParcelId, parcelIds, cancellationToken);

        // -----------------------------------------------------------------
        // Per-shipment dependents
        // -----------------------------------------------------------------
        long shipmentTrackingEvents = 0;
        if (shipmentGuids.Length > 0)
        {
            shipmentTrackingEvents += (await context.ShipmentTrackingEvents.DeleteManyAsync(
                Builders<ShipmentTrackingEventDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
                cancellationToken)).DeletedCount;
        }
        if (parcelGuids.Length > 0)
        {
            // Sweep tracking events that point at the parcel but have no
            // shipment id (older receive-flow events were attached this way).
            var nullableParcelGuids = parcelGuids.Cast<Guid?>().ToArray();
            shipmentTrackingEvents += (await context.ShipmentTrackingEvents.DeleteManyAsync(
                Builders<ShipmentTrackingEventDocument>.Filter.In(x => x.ParcelId, nullableParcelGuids),
                cancellationToken)).DeletedCount;
        }

        long shipmentCollections = 0;
        long pickTasks = 0;
        long packingTasks = 0;
        if (shipmentGuids.Length > 0)
        {
            shipmentCollections = (await context.ShipmentCollections.DeleteManyAsync(
                Builders<ShipmentCollectionDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
                cancellationToken)).DeletedCount;

            pickTasks = (await context.PickTasks.DeleteManyAsync(
                Builders<PickTaskDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
                cancellationToken)).DeletedCount;

            packingTasks = (await context.PackingTasks.DeleteManyAsync(
                Builders<PackingTaskDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
                cancellationToken)).DeletedCount;

            // Pull deleted shipment IDs out of any dispatch manifests still
            // listing them — we keep the manifest record itself (ops history),
            // but it shouldn't reference shipments that no longer exist.
            await context.DispatchManifests.UpdateManyAsync(
                Builders<DispatchManifestDocument>.Filter.AnyIn(x => x.ShipmentIds, shipmentGuids),
                Builders<DispatchManifestDocument>.Update.PullAll(x => x.ShipmentIds, shipmentGuids),
                cancellationToken: cancellationToken);
        }

        // -----------------------------------------------------------------
        // Per-quote dependents
        // -----------------------------------------------------------------
        long quoteCheckoutPayments = 0;
        long quotePaymentInvoices = 0;
        if (quoteGuids.Length > 0)
        {
            quoteCheckoutPayments = (await context.QuoteCheckoutPayments.DeleteManyAsync(
                Builders<QuoteCheckoutPaymentDocument>.Filter.In(x => x.QuoteId, quoteGuids),
                cancellationToken)).DeletedCount;

            quotePaymentInvoices = (await context.QuotePaymentInvoices.DeleteManyAsync(
                Builders<QuotePaymentInvoiceDocument>.Filter.In(x => x.QuoteId, quoteGuids),
                cancellationToken)).DeletedCount;
        }

        // -----------------------------------------------------------------
        // Direct user-owned collections (UserId field)
        // -----------------------------------------------------------------
        var supportTickets = (await context.SupportTickets.DeleteManyAsync(
            Builders<SupportTicketDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var inAppNotifications = (await context.CustomerInAppNotifications.DeleteManyAsync(
            Builders<CustomerInAppNotificationDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var kycSubmissions = (await context.KycSubmissions.DeleteManyAsync(
            Builders<KycSubmissionDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var kycDocumentSessions = (await context.KycDocumentUploadSessions.DeleteManyAsync(
            Builders<KycDocumentUploadSessionDocument>.Filter.Eq(x => x.UserId, userGuid),
            cancellationToken)).DeletedCount;

        var payLaterIntents = (await context.PayLaterIntents.DeleteManyAsync(
            Builders<PayLaterIntentDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var refreshTokens = (await context.RefreshTokens.DeleteManyAsync(
            Builders<RefreshTokenDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var externalIdentities = (await context.ExternalIdentities.DeleteManyAsync(
            Builders<ExternalIdentityDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var addresses = (await context.Addresses.DeleteManyAsync(
            Builders<CustomerAddressDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var suiteSubscriptions = (await context.SuiteSubscriptions.DeleteManyAsync(
            Builders<SuiteSubscriptionDocument>.Filter.Eq(x => x.UserId, userId),
            cancellationToken)).DeletedCount;

        var suiteCheckoutPayments = (await context.SuiteCheckoutPayments.DeleteManyAsync(
            Builders<SuiteCheckoutPaymentDocument>.Filter.Eq(x => x.UserId, userGuid),
            cancellationToken)).DeletedCount;

        var savedCards = (await context.CustomerSavedCards.DeleteManyAsync(
            Builders<CustomerSavedCardDocument>.Filter.Eq(x => x.UserId, userGuid),
            cancellationToken)).DeletedCount;

        var paymentMethodIntents = (await context.PaymentMethodAddIntents.DeleteManyAsync(
            Builders<PaymentMethodAddIntentDocument>.Filter.Eq(x => x.UserId, userGuid),
            cancellationToken)).DeletedCount;

        // -----------------------------------------------------------------
        // Root aggregates (after every dependent is gone)
        // -----------------------------------------------------------------
        long deletedQuotes = 0;
        if (quoteIds.Length > 0)
        {
            deletedQuotes = (await context.Quotes.DeleteManyAsync(
                Builders<QuoteDocument>.Filter.In(x => x.Id, quoteIds),
                cancellationToken)).DeletedCount;
        }

        long deletedShipments = 0;
        if (shipmentIds.Length > 0)
        {
            deletedShipments = (await context.Shipments.DeleteManyAsync(
                Builders<ShipmentDocument>.Filter.In(x => x.Id, shipmentIds),
                cancellationToken)).DeletedCount;
        }

        long deletedParcels = 0;
        if (parcelIds.Length > 0)
        {
            deletedParcels = (await context.Parcels.DeleteManyAsync(
                Builders<ParcelDocument>.Filter.In(x => x.Id, parcelIds),
                cancellationToken)).DeletedCount;
        }

        // -----------------------------------------------------------------
        // Finally the user document itself
        // -----------------------------------------------------------------
        var userResult = await context.Users.DeleteOneAsync(
            Builders<UserDocument>.Filter.Eq(x => x.Id, userId),
            cancellationToken);

        var report = new CustomerEraseReport
        {
            UserDeleted = userResult.DeletedCount > 0,
            ExternalIdentities = externalIdentities,
            RefreshTokens = refreshTokens,
            Addresses = addresses,
            SuiteSubscriptions = suiteSubscriptions,
            SuiteCheckoutPayments = suiteCheckoutPayments,
            Parcels = deletedParcels,
            ParcelInvoices = parcelInvoices,
            ParcelOpsMetadata = parcelOpsMetadata,
            ParcelOpsExceptions = parcelOpsExceptions,
            ParcelOpsActivity = parcelOpsActivity,
            ParcelOpsPhotos = parcelOpsPhotos,
            OpsPhotoUploadSessions = opsPhotoSessions,
            WarehouseMovements = warehouseMovements,
            QuoteParcels = quoteParcelDeletes,
            Shipments = deletedShipments,
            ShipmentTrackingEvents = shipmentTrackingEvents,
            ShipmentCollections = shipmentCollections,
            PickTasks = pickTasks,
            PackingTasks = packingTasks,
            Quotes = deletedQuotes,
            QuoteCheckoutPayments = quoteCheckoutPayments,
            QuotePaymentInvoices = quotePaymentInvoices,
            SupportTickets = supportTickets,
            InAppNotifications = inAppNotifications,
            KycSubmissions = kycSubmissions,
            KycDocumentUploadSessions = kycDocumentSessions,
            PayLaterIntents = payLaterIntents,
        };

        logger.LogInformation(
            "Customer {UserId} erased — user_deleted={UserDeleted}, parcels={Parcels}, shipments={Shipments}, quotes={Quotes}, dependents={Dependents}.",
            userGuid,
            report.UserDeleted,
            report.Parcels,
            report.Shipments,
            report.Quotes,
            report.TotalDependents);

        return report;
    }

    private static async Task<long> DeleteByParcelIdAsync<TDoc>(
        IMongoCollection<TDoc> collection,
        System.Linq.Expressions.Expression<Func<TDoc, ParcelId>> field,
        ParcelId[] ids,
        CancellationToken cancellationToken)
    {
        if (ids.Length == 0) return 0;
        var filter = Builders<TDoc>.Filter.In(field, ids);
        var result = await collection.DeleteManyAsync(filter, cancellationToken);
        return result.DeletedCount;
    }

    private static async Task<long> DeleteByGuidAsync<TDoc>(
        IMongoCollection<TDoc> collection,
        System.Linq.Expressions.Expression<Func<TDoc, Guid>> field,
        Guid[] ids,
        CancellationToken cancellationToken)
    {
        if (ids.Length == 0) return 0;
        var filter = Builders<TDoc>.Filter.In(field, ids);
        var result = await collection.DeleteManyAsync(filter, cancellationToken);
        return result.DeletedCount;
    }
}
