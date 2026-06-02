using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Application.Abstractions.Time;
using Wayel.Application.Configuration;
using Wayel.Application.Features.OpsAuth;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// Provisions bootstrap warehouse lead invitations on startup (invite-only access).
/// </summary>
internal sealed class OpsUserSeeder(
    IServiceScopeFactory scopeFactory,
    IOptions<OpsAuthOptions> options,
    ILogger<OpsUserSeeder> logger) : IHostedService
{
    private const string BootstrapInvitedByEmail = "bootstrap@weyell.com";

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
        var invitations = scope.ServiceProvider.GetRequiredService<IOpsInvitationRepository>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        var now = clock.UtcNow;

        foreach (var email in emails)
        {
            var existingUser = await users.GetByEmailAsync(email, cancellationToken);
            if (existingUser is not null)
            {
                continue;
            }

            var pending = await invitations.GetPendingByEmailAsync(email, cancellationToken);
            if (pending is not null)
            {
                logger.LogInformation(
                    "Bootstrap ops invite already pending for {Email} (/?invite={Token})",
                    email,
                    pending.Token);
                continue;
            }

            var token = OpsInvitationTokens.New();
            var record = new OpsInvitationRecord(
                Guid.NewGuid(),
                email,
                "lead",
                OpsRegions.ResolveForRole("lead", null),
                token,
                "Pending",
                now.AddDays(14),
                BootstrapInvitedByEmail,
                now,
                null);

            await invitations.AddAsync(record, cancellationToken);
            logger.LogWarning(
                "Bootstrap ops invite created for {Email}. First sign-in requires /?invite={Token}",
                email,
                token);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
