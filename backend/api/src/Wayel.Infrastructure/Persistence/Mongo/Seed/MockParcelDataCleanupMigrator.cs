using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using Wayel.Domain.Parcels;
using Wayel.Domain.Quotes;
using Wayel.Domain.Shipments;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// One-shot startup migrator that removes the historical demo-persona parcel
/// fixtures (and their dependent rows) from MongoDB so the production schema
/// only carries parcels created via the real ops "receive parcel" flow.
///
/// Scope:
///   * Targets only stable IDs from <see cref="DemoPersonaIds"/> — never deletes
///     parcels created by customers or the dev <c>/borderbox/dev/seed-shippable-parcels</c>
///     endpoint.
///   * Cascades through every collection that holds a foreign key to those
///     parcels / shipments / quotes (invoices, ops metadata + activity +
///     exceptions + photos, warehouse movements, pick/packing tasks,
///     shipment_collections, shipment_tracking_events, quote_parcels,
///     quote_checkout_payments, quote_payment_invoices).
///
/// Idempotent — runs on every startup but the per-collection filters are
/// constant <c>$in</c> sets, so once the legacy rows are gone subsequent
/// boots issue a handful of zero-hit deletes.
/// </summary>
internal sealed class MockParcelDataCleanupMigrator(
    MongoContext context,
    ILogger<MockParcelDataCleanupMigrator> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) =>
        BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(MockParcelDataCleanupMigrator),
            RunAsync,
            cancellationToken);

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var parcelIds = AllDemoParcelIds().ToArray();
        var shipmentIds = AllDemoShipmentIds().ToArray();
        var quoteIds = AllDemoQuoteIds().ToArray();
        var parcelGuids = parcelIds.Select(p => p.Value).ToArray();
        var shipmentGuids = shipmentIds.Select(s => s.Value).ToArray();
        var quoteGuids = quoteIds.Select(q => q.Value).ToArray();

        var totalDeleted = 0L;

        // --- Per-parcel dependents -----------------------------------------
        totalDeleted += await DeleteByParcelIdAsync(
            context.ParcelInvoices,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        totalDeleted += await DeleteByParcelIdAsync(
            context.ParcelOpsMetadata,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        totalDeleted += await DeleteByParcelIdAsync(
            context.ParcelOpsExceptions,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        totalDeleted += await DeleteByParcelIdAsync(
            context.ParcelOpsActivity,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        totalDeleted += await DeleteByParcelIdAsync(
            context.ParcelOpsPhotos,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        // Warehouse movements / pick task lines / quote_parcels store the
        // parcel id as a raw Guid (not the strong-typed wrapper) — use the
        // unwrapped set so the filter compiles in either case.
        totalDeleted += await DeleteByGuidAsync(
            context.WarehouseMovements,
            x => x.ParcelId,
            parcelGuids,
            cancellationToken);

        // quote_parcels is not surfaced on MongoContext — keep the literal
        // collection name in lock-step with MongoQuoteParcelRepository.
        var quoteParcels = context.Database.GetCollection<QuoteParcelDocument>("quote_parcels");
        totalDeleted += await DeleteByParcelIdAsync(
            quoteParcels,
            x => x.ParcelId,
            parcelIds,
            cancellationToken);

        // --- Per-shipment dependents ---------------------------------------
        totalDeleted += (await context.ShipmentTrackingEvents.DeleteManyAsync(
            Builders<ShipmentTrackingEventDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
            cancellationToken)).DeletedCount;

        // Sweep any tracking event hanging off a demo parcel directly — older
        // seeders attached events to ParcelId without a ShipmentId.
        var nullableParcelGuids = parcelGuids.Cast<Guid?>().ToArray();
        totalDeleted += (await context.ShipmentTrackingEvents.DeleteManyAsync(
            Builders<ShipmentTrackingEventDocument>.Filter.In(x => x.ParcelId, nullableParcelGuids),
            cancellationToken)).DeletedCount;

        totalDeleted += (await context.ShipmentCollections.DeleteManyAsync(
            Builders<ShipmentCollectionDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
            cancellationToken)).DeletedCount;

        totalDeleted += (await context.PickTasks.DeleteManyAsync(
            Builders<PickTaskDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
            cancellationToken)).DeletedCount;

        totalDeleted += (await context.PackingTasks.DeleteManyAsync(
            Builders<PackingTaskDocument>.Filter.In(x => x.ShipmentId, shipmentGuids),
            cancellationToken)).DeletedCount;

        // --- Per-quote dependents ------------------------------------------
        totalDeleted += (await context.QuoteCheckoutPayments.DeleteManyAsync(
            Builders<QuoteCheckoutPaymentDocument>.Filter.In(x => x.QuoteId, quoteGuids),
            cancellationToken)).DeletedCount;

        totalDeleted += (await context.QuotePaymentInvoices.DeleteManyAsync(
            Builders<QuotePaymentInvoiceDocument>.Filter.In(x => x.QuoteId, quoteGuids),
            cancellationToken)).DeletedCount;

        // --- Root aggregates (last, so dependents are gone first) ----------
        var quoteResult = await context.Quotes.DeleteManyAsync(
            Builders<QuoteDocument>.Filter.In(x => x.Id, quoteIds),
            cancellationToken);

        var shipmentResult = await context.Shipments.DeleteManyAsync(
            Builders<ShipmentDocument>.Filter.In(x => x.Id, shipmentIds),
            cancellationToken);

        var parcelResult = await context.Parcels.DeleteManyAsync(
            Builders<ParcelDocument>.Filter.In(x => x.Id, parcelIds),
            cancellationToken);

        totalDeleted += quoteResult.DeletedCount + shipmentResult.DeletedCount + parcelResult.DeletedCount;

        if (parcelResult.DeletedCount > 0
            || shipmentResult.DeletedCount > 0
            || quoteResult.DeletedCount > 0)
        {
            logger.LogInformation(
                "Mock parcel cleanup: removed {Parcels} parcel(s), {Shipments} shipment(s), {Quotes} quote(s) and {Dependents} dependent row(s) across invoices/ops/warehouse/tracking/payments.",
                parcelResult.DeletedCount,
                shipmentResult.DeletedCount,
                quoteResult.DeletedCount,
                totalDeleted - parcelResult.DeletedCount - shipmentResult.DeletedCount - quoteResult.DeletedCount);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

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

    /// <summary>
    /// Every parcel id that the legacy <c>DemoPersonaSeedBuilder</c> ever
    /// inserted. Kept in one place so a future code-archaeology pass can
    /// see exactly which fixtures the migrator is targeting.
    /// </summary>
    private static IEnumerable<ParcelId> AllDemoParcelIds()
    {
        yield return DemoPersonaIds.Active.P1;
        yield return DemoPersonaIds.Active.P2;
        yield return DemoPersonaIds.Active.P3;
        yield return DemoPersonaIds.Active.P4;
        yield return DemoPersonaIds.Expiring.P1;
        yield return DemoPersonaIds.Expiring.P2;
        yield return DemoPersonaIds.Expired.P1;
        yield return DemoPersonaIds.Expired.P2;
        yield return DemoPersonaIds.Expired.P3;
        yield return DemoPersonaIds.Expired.P4;
        yield return DemoPersonaIds.Expired.P5;
        yield return DemoPersonaIds.Expired.P6;
        yield return DemoPersonaIds.QuoteApproved.P1;
        yield return DemoPersonaIds.QuoteApproved.P2;
        yield return DemoPersonaIds.Inbox.P1;
        yield return DemoPersonaIds.Inbox.P2;
        yield return DemoPersonaIds.Inbox.P3;
        yield return DemoPersonaIds.Inbox.P4;
        yield return DemoPersonaIds.Inbox.P5;
        yield return DemoPersonaIds.Inbox.P6;
        yield return DemoPersonaIds.Inbox.P7;
        yield return DemoPersonaIds.Inbox.P8;
    }

    private static IEnumerable<ShipmentId> AllDemoShipmentIds()
    {
        yield return DemoPersonaIds.Expired.InTransit;
        yield return DemoPersonaIds.Expired.QuoteShip;
        yield return DemoPersonaIds.QuoteApproved.Shipment;
    }

    private static IEnumerable<QuoteId> AllDemoQuoteIds()
    {
        yield return DemoPersonaIds.Expired.Quote;
        yield return DemoPersonaIds.QuoteApproved.Quote;
    }
}
