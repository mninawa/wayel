using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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

        await context.Parcels.Indexes.CreateOneAsync(
            new CreateIndexModel<ParcelDocument>(
                Builders<ParcelDocument>.IndexKeys
                    .Ascending(x => x.UserId)
                    .Descending(x => x.ReceivedAtUtc),
                new CreateIndexOptions { Name = "ix_parcels_user_received" }),
            cancellationToken: cancellationToken);

        logger.LogInformation("MongoDB indexes ready.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
