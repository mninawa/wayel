using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>Provisions bootstrap warehouse leads on startup.</summary>
internal sealed class OpsUserSeeder(
    IServiceScopeFactory scopeFactory,
    IOptions<OpsAuthOptions> options,
    ILogger<OpsUserSeeder> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var emails = options.Value.BootstrapLeadEmails
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(OpsEmailNormalizer.Normalize)
            .Distinct()
            .ToList();

        if (emails.Count == 0)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<IOpsUserRepository>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        var now = clock.UtcNow;

        foreach (var email in emails)
        {
            var existing = await users.GetByEmailAsync(email, cancellationToken);
            if (existing is not null)
            {
                continue;
            }

            var user = new OpsUserRecord(
                Guid.NewGuid(),
                email,
                email.Split('@')[0],
                "lead",
                GoogleSubject: null,
                IsDisabled: false,
                now,
                null,
                Regions: []);

            await users.AddAsync(user, cancellationToken);
            logger.LogInformation("Bootstrap ops lead provisioned for {Email}", email);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
