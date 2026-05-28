using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo;

internal sealed class MongoIndexInitializer(MongoContext context, ILogger<MongoIndexInitializer> logger)
    : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Ensuring WeYell MongoDB indexes...");

        await context.Users.Indexes.CreateOneAsync(
            new CreateIndexModel<UserDocument>(
                Builders<UserDocument>.IndexKeys.Ascending(x => x.Email),
                new CreateIndexOptions { Unique = true, Name = "ux_users_email" }),
            cancellationToken: cancellationToken);

        await context.SuiteSubscriptions.Indexes.CreateOneAsync(
            new CreateIndexModel<SuiteSubscriptionDocument>(
                Builders<SuiteSubscriptionDocument>.IndexKeys.Ascending(x => x.UserId),
                new CreateIndexOptions { Unique = true, Name = "ux_suite_subscriptions_user" }),
            cancellationToken: cancellationToken);

        // Partial unique index on SuiteNumber: only enforce uniqueness for
        // populated (non-null, non-empty) values. This is the database-level
        // guard that backs up the in-process pool allocator — a future bug
        // that tries to insert a duplicate fails loudly instead of silently
        // assigning two users to the same warehouse mailbox.
        try
        {
            await context.SuiteSubscriptions.Indexes.CreateOneAsync(
                new CreateIndexModel<SuiteSubscriptionDocument>(
                    Builders<SuiteSubscriptionDocument>.IndexKeys.Ascending(x => x.SuiteNumber),
                    new CreateIndexOptions<SuiteSubscriptionDocument>
                    {
                        Unique = true,
                        Name = "ux_suite_subscriptions_number",
                        PartialFilterExpression = new BsonDocument
                        {
                            ["suiteNumber"] = new BsonDocument
                            {
                                ["$exists"] = true,
                                ["$type"] = "string",
                                ["$gt"] = string.Empty,
                            },
                        },
                    }),
                cancellationToken: cancellationToken);
        }
        catch (MongoCommandException ex)
        {
            // Existing duplicates in the dataset will block index creation —
            // we surface them via the ops reconcile endpoint instead, so a
            // dirty database doesn't prevent the rest of the app from booting.
            logger.LogWarning(ex,
                "Could not create unique index on suite_subscriptions.SuiteNumber (probably duplicates). Run the ops reconcile flow.");
        }

        await context.SuiteNumberPool.Indexes.CreateOneAsync(
            new CreateIndexModel<SuiteNumberPoolEntryDocument>(
                Builders<SuiteNumberPoolEntryDocument>.IndexKeys.Ascending(x => x.Number),
                new CreateIndexOptions { Unique = true, Name = "ux_suite_number_pool_number" }),
            cancellationToken: cancellationToken);

        // Composite key the atomic claim filters on. Ordering by created/number
        // here also lines up with the FindOneAndUpdate sort so the next claim
        // is satisfied with an index scan instead of a sort stage.
        await context.SuiteNumberPool.Indexes.CreateOneAsync(
            new CreateIndexModel<SuiteNumberPoolEntryDocument>(
                Builders<SuiteNumberPoolEntryDocument>.IndexKeys
                    .Ascending(x => x.RegionCode)
                    .Ascending(x => x.Status)
                    .Ascending(x => x.CreatedAtUtc)
                    .Ascending(x => x.Number),
                new CreateIndexOptions { Name = "ix_suite_number_pool_region_status_created" }),
            cancellationToken: cancellationToken);

        await context.CustomerInAppNotifications.Indexes.CreateOneAsync(
            new CreateIndexModel<CustomerInAppNotificationDocument>(
                Builders<CustomerInAppNotificationDocument>.IndexKeys
                    .Ascending(x => x.UserId)
                    .Descending(x => x.CreatedAtUtc),
                new CreateIndexOptions { Name = "ix_customer_inapp_notifications_user_created" }),
            cancellationToken: cancellationToken);

        await context.Parcels.Indexes.CreateOneAsync(
            new CreateIndexModel<ParcelDocument>(
                Builders<ParcelDocument>.IndexKeys
                    .Ascending(x => x.UserId)
                    .Descending(x => x.ReceivedAtUtc),
                new CreateIndexOptions { Name = "ix_parcels_user_received" }),
            cancellationToken: cancellationToken);

        await context.ShipmentTrackingEvents.Indexes.CreateOneAsync(
            new CreateIndexModel<ShipmentTrackingEventDocument>(
                Builders<ShipmentTrackingEventDocument>.IndexKeys
                    .Ascending(x => x.ShipmentId)
                    .Descending(x => x.OccurredAtUtc),
                new CreateIndexOptions { Name = "ix_shipment_tracking_events_shipment_occurred" }),
            cancellationToken: cancellationToken);

        // pickup_branches uses string slug as _id (via PickupBranchDocument.Id) — unique by default.

        await context.PayLaterIntents.Indexes.CreateOneAsync(
            new CreateIndexModel<PayLaterIntentDocument>(
                Builders<PayLaterIntentDocument>.IndexKeys.Ascending(x => x.UserId),
                new CreateIndexOptions { Unique = true, Name = "ux_pay_later_intents_user" }),
            cancellationToken: cancellationToken);

        await context.PayLaterIntents.Indexes.CreateOneAsync(
            new CreateIndexModel<PayLaterIntentDocument>(
                Builders<PayLaterIntentDocument>.IndexKeys
                    .Ascending(x => x.ResolvedAtUtc)
                    .Descending(x => x.CreatedAtUtc),
                new CreateIndexOptions { Name = "ix_pay_later_intents_status_created" }),
            cancellationToken: cancellationToken);

        await context.OpsExceptionSupportNotifications.Indexes.CreateOneAsync(
            new CreateIndexModel<OpsExceptionSupportNotificationDocument>(
                Builders<OpsExceptionSupportNotificationDocument>.IndexKeys
                    .Ascending(x => x.ParcelId)
                    .Ascending(x => x.ExceptionType),
                new CreateIndexOptions { Unique = true, Name = "ux_ops_exception_support_notify" }),
            cancellationToken: cancellationToken);

        logger.LogInformation("MongoDB indexes ready.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
