using System.Text;
using MongoDB.Bson;
using MongoDB.Driver;
using Wayel.Application.Abstractions.Auditing;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

/// <summary>
/// Mongo-backed read side for the audit log. Results are returned in
/// <c>OccurredOnUtc DESC, _id DESC</c> order so paging is stable even when
/// many entries land in the same millisecond.
///
/// Pagination uses a continuation token rather than skip/limit because the
/// audit collection grows unbounded and Mongo's <c>skip</c> degrades
/// linearly with offset. The token encodes the last row's
/// <c>(OccurredOnUtc, _id)</c> pair as base64url JSON; opaque to callers,
/// trivially debuggable for us.
/// </summary>
internal sealed class MongoAuditLogReader(MongoContext context) : IAuditLogReader
{
    private const int MaxPageSize = 200;
    private const int MinPageSize = 1;

    public async Task<AuditLogPage> QueryAsync(AuditLogQuery query, CancellationToken cancellationToken = default)
    {
        var pageSize = Math.Clamp(query.PageSize, MinPageSize, MaxPageSize);

        var builder = Builders<AuditLogDocument>.Filter;
        var filters = new List<FilterDefinition<AuditLogDocument>>();

        if (query.FromUtc is { } from)
        {
            filters.Add(builder.Gte(x => x.OccurredOnUtc, from));
        }

        if (query.ToUtc is { } to)
        {
            filters.Add(builder.Lt(x => x.OccurredOnUtc, to));
        }

        if (!string.IsNullOrWhiteSpace(query.Action))
        {
            filters.Add(builder.Eq(x => x.Action, query.Action));
        }

        if (!string.IsNullOrWhiteSpace(query.ActorEmail))
        {
            // Case-insensitive on email so operators don't have to remember
            // the exact casing the SSO provider returned. Anchored regex so
            // we still benefit from the index (Mongo can use a prefix-only
            // case-insensitive scan in practice).
            filters.Add(builder.Regex(
                x => x.ActorEmail,
                new BsonRegularExpression($"^{Regex(query.ActorEmail!)}$", "i")));
        }

        if (query.ActorUserId is { } actorId)
        {
            filters.Add(builder.Eq(x => x.ActorUserId, actorId));
        }

        if (query.Outcome is { } outcome)
        {
            filters.Add(builder.Eq(x => x.Outcome, outcome.ToString()));
        }

        if (query.TenantId is { } tenantId)
        {
            // Match the first-class TenantId on rows written after the
            // field landed, OR the legacy `metadata.tenant_id` string for
            // rows written before. The legacy clause uses Mongo's dotted
            // path on the dictionary so the reader stays in one round-trip
            // — a self-join would cost an order of magnitude more.
            var tenantString = tenantId.ToString();
            filters.Add(builder.Or(
                builder.Eq(x => x.TenantId, tenantId),
                builder.Eq("metadata.tenant_id", tenantString)));
        }

        if (TryDecodeToken(query.ContinuationToken, out var cursor))
        {
            // Compound cursor: rows strictly older than the cursor, OR same
            // timestamp but smaller _id (we sort _id DESC inside a tie).
            var olderTimestamp = builder.Lt(x => x.OccurredOnUtc, cursor.OccurredOnUtc);
            var sameTimestampSmallerId = builder.And(
                builder.Eq(x => x.OccurredOnUtc, cursor.OccurredOnUtc),
                builder.Lt(x => x.Id, cursor.Id));
            filters.Add(builder.Or(olderTimestamp, sameTimestampSmallerId));
        }

        var combined = filters.Count == 0 ? builder.Empty : builder.And(filters);

        // Fetch one extra row to detect "is there another page?". If we
        // get pageSize+1 rows back, the extra one tells us a continuation
        // token is needed; we don't return it to the caller.
        var docs = await context.AuditLog
            .Find(combined)
            .Sort(Builders<AuditLogDocument>.Sort
                .Descending(x => x.OccurredOnUtc)
                .Descending(x => x.Id))
            .Limit(pageSize + 1)
            .ToListAsync(cancellationToken);

        string? nextToken = null;
        if (docs.Count > pageSize)
        {
            var last = docs[pageSize - 1];
            nextToken = EncodeToken(new AuditCursor(last.OccurredOnUtc, last.Id));
            docs = docs.Take(pageSize).ToList();
        }

        var entries = docs.Select(d => d.ToEntry()).ToList();
        return new AuditLogPage(entries, nextToken);
    }

    private static string Regex(string raw) =>
        System.Text.RegularExpressions.Regex.Escape(raw);

    private readonly record struct AuditCursor(DateTime OccurredOnUtc, ObjectId Id);

    private static string EncodeToken(AuditCursor cursor)
    {
        var json = $"{{\"t\":\"{cursor.OccurredOnUtc:O}\",\"i\":\"{cursor.Id}\"}}";
        var bytes = Encoding.UTF8.GetBytes(json);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static bool TryDecodeToken(string? raw, out AuditCursor cursor)
    {
        cursor = default;
        if (string.IsNullOrWhiteSpace(raw)) return false;

        try
        {
            var padded = raw.Replace('-', '+').Replace('_', '/');
            switch (padded.Length % 4)
            {
                case 2: padded += "=="; break;
                case 3: padded += "="; break;
            }
            var bytes = Convert.FromBase64String(padded);
            var json = Encoding.UTF8.GetString(bytes);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var occurred = root.GetProperty("t").GetDateTime().ToUniversalTime();
            var id = ObjectId.Parse(root.GetProperty("i").GetString()!);
            cursor = new AuditCursor(occurred, id);
            return true;
        }
        catch
        {
            // Treat malformed tokens as "start from the top" rather than
            // surfacing a 400 — admin pages frequently get bookmarked.
            return false;
        }
    }
}
