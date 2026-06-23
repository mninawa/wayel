using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MongoDB.Driver;
using Wayel.Application.Configuration;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// While customer KYC is paused (<see cref="KycOptions.Enabled"/> is false),
/// marks every non-verified customer (and any open submission rows) as verified
/// so ops and downstream checks treat existing accounts as cleared.
/// Idempotent — safe on every startup until KYC is re-enabled.
/// </summary>
internal sealed class CustomerKycVerifiedBackfillMigrator(
    MongoContext context,
    IOptions<KycOptions> kycOptions,
    ILogger<CustomerKycVerifiedBackfillMigrator> logger) : IHostedService
{
    private const string ReviewedBy = "kyc-pause-backfill";

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (kycOptions.Value.Enabled)
        {
            return Task.CompletedTask;
        }

        return BackgroundMigratorHost.QueueAsync(
            logger,
            nameof(CustomerKycVerifiedBackfillMigrator),
            RunAsync,
            cancellationToken);
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        var userFilter = Builders<UserDocument>.Filter.And(
            Builders<UserDocument>.Filter.Eq(x => x.Role, UserRole.Customer),
            Builders<UserDocument>.Filter.Ne(x => x.KycStatus, KycStatus.Verified));

        var userUpdate = Builders<UserDocument>.Update
            .Set(x => x.KycStatus, KycStatus.Verified)
            .Set(x => x.KycVerifiedAtUtc, now)
            .Unset(x => x.KycRejectionReason);

        var userResult = await context.Users.UpdateManyAsync(
            userFilter,
            userUpdate,
            cancellationToken: cancellationToken);

        var submissionFilter = Builders<KycSubmissionDocument>.Filter.Ne(
            x => x.KycStatus,
            KycStatus.Verified);

        var submissionUpdate = Builders<KycSubmissionDocument>.Update
            .Set(x => x.KycStatus, KycStatus.Verified)
            .Set(x => x.ReviewedAtUtc, now)
            .Set(x => x.ReviewedBy, ReviewedBy)
            .Unset(x => x.RejectionReason);

        var submissionResult = await context.KycSubmissions.UpdateManyAsync(
            submissionFilter,
            submissionUpdate,
            cancellationToken: cancellationToken);

        if (userResult.ModifiedCount > 0 || submissionResult.ModifiedCount > 0)
        {
            logger.LogInformation(
                "KYC pause backfill verified {UserCount} customer(s) and {SubmissionCount} submission(s).",
                userResult.ModifiedCount,
                submissionResult.ModifiedCount);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
