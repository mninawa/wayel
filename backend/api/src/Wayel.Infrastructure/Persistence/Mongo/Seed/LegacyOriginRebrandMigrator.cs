using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Wayel.Application.Features.SuitePlatform;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

/// <summary>
/// One-shot startup migrator that rewrites historical
/// <c>shipment_tracking_events</c> rows whose <c>Location</c> still
/// references the legacy hub city ("Midrand") so customer-facing shipment
/// timelines flip to the current hub ("Sandton") without losing any of the
/// other location-tagged context (province, country, etc.).
///
/// Idempotent — runs on every startup but only matches stale rows, so
/// once every legacy row has been rewritten subsequent boots are a
/// single-document Find with zero hits.
/// </summary>
internal sealed class LegacyOriginRebrandMigrator(
    MongoContext context,
    ILogger<LegacyOriginRebrandMigrator> logger) : IHostedService
{
    /// <summary>City prefix we used to write to <c>Location</c>. Anchored
    /// at the start of the string so we never touch a row that mentions
    /// "Midrand" inside a free-form details field that happened to be
    /// stored in Location by accident.</summary>
    private const string LegacyCityPrefix = "Midrand";

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var filter = Builders<ShipmentTrackingEventDocument>.Filter.Regex(
            x => x.Location,
            new BsonRegularExpression($"^{LegacyCityPrefix}", "i"));

        var legacy = await context.ShipmentTrackingEvents
            .Find(filter)
            .ToListAsync(cancellationToken);

        if (legacy.Count == 0)
        {
            return;
        }

        var ops = new List<WriteModel<ShipmentTrackingEventDocument>>(legacy.Count);
        foreach (var doc in legacy)
        {
            // Preserve everything after the legacy city prefix — typically
            // ", South Africa" or ", Gauteng, South Africa" — so the
            // rebrand survives any future hub move that keeps the rest of
            // the address structure intact.
            var suffix = doc.Location.Length > LegacyCityPrefix.Length
                ? doc.Location[LegacyCityPrefix.Length..]
                : string.Empty;
            var rebranded = $"{WeYellHubAddress.City}{suffix}";

            var idFilter = Builders<ShipmentTrackingEventDocument>.Filter.Eq(x => x.Id, doc.Id);
            var update = Builders<ShipmentTrackingEventDocument>.Update.Set(x => x.Location, rebranded);
            ops.Add(new UpdateOneModel<ShipmentTrackingEventDocument>(idFilter, update));
        }

        var result = await context.ShipmentTrackingEvents.BulkWriteAsync(
            ops,
            cancellationToken: cancellationToken);

        logger.LogInformation(
            "Rebranded {Count} legacy {LegacyCity} → {NewCity} tracking event row(s).",
            result.ModifiedCount,
            LegacyCityPrefix,
            WeYellHubAddress.City);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
