using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Security;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Seeds WeYell demo personas (one per customer-journey stage) into MongoDB on startup.
/// Skips any persona whose email already exists so partial re-runs are safe.
/// </summary>
internal sealed class DemoDataSeeder(
    MongoContext context,
    IServiceScopeFactory scopeFactory,
    IOptions<DemoDataOptions> options,
    ILogger<DemoDataSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var quarterlyPlan = await context.SuitePlans
            .Find(x => x.DurationMonths == 3)
            .FirstOrDefaultAsync(cancellationToken);
        var monthlyPlan = await context.SuitePlans
            .Find(x => x.DurationMonths == 1)
            .FirstOrDefaultAsync(cancellationToken);
        if (quarterlyPlan is null || monthlyPlan is null)
        {
            logger.LogWarning("Suite plans not seeded yet — demo personas skipped. Restart API after plans exist.");
            return;
        }

        var passwordHash = passwordHasher.Hash(options.Value.DemoPassword);
        var now = DateTime.UtcNow;
        var bundles = DemoPersonaSeedBuilder.BuildAll(passwordHash, quarterlyPlan, monthlyPlan, now);

        var seeded = 0;
        foreach (var bundle in bundles)
        {
            var email = bundle.Email.Trim().ToLowerInvariant();
            var exists = await context.Users
                .Find(x => x.Email == email)
                .AnyAsync(cancellationToken);
            if (exists)
            {
                logger.LogDebug("Demo persona {Email} already exists — skipping.", email);
                continue;
            }

            await SeedPersonaAsync(bundle, cancellationToken);
            seeded++;
            logger.LogInformation(
                "Seeded demo persona {Email} ({Stage}): {Description}",
                email,
                bundle.Stage,
                bundle.Description);
        }

        if (seeded > 0)
        {
            logger.LogInformation(
                "Demo seed complete: {Count} persona(s) inserted. Password (except Google-only): {Password}",
                seeded,
                options.Value.DemoPassword);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task SeedPersonaAsync(
        DemoPersonaSeedBundle bundle,
        CancellationToken cancellationToken)
    {
        await context.Users.InsertOneAsync(
            UserDocument.FromDomain(bundle.User),
            cancellationToken: cancellationToken);

        if (bundle.GoogleIdentity is not null)
        {
            await context.ExternalIdentities.InsertOneAsync(
                bundle.GoogleIdentity,
                cancellationToken: cancellationToken);
        }

        if (bundle.Subscription is not null)
        {
            await context.SuiteSubscriptions.InsertOneAsync(
                bundle.Subscription,
                cancellationToken: cancellationToken);
        }

        if (bundle.Addresses.Count > 0)
        {
            await context.Addresses.InsertManyAsync(bundle.Addresses, cancellationToken: cancellationToken);
        }

        if (bundle.Tickets.Count > 0)
        {
            await context.SupportTickets.InsertManyAsync(bundle.Tickets, cancellationToken: cancellationToken);
        }
    }
}
