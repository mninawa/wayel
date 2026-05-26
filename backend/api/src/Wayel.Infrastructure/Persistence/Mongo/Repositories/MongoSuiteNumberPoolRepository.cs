using MongoDB.Driver;
using Wayel.Application.Abstractions.Persistence;
using Wayel.Domain.SuiteSubscriptions;
using Wayel.Domain.Users;
using Wayel.Infrastructure.Persistence.Mongo.Documents;

namespace Wayel.Infrastructure.Persistence.Mongo.Repositories;

internal sealed class MongoSuiteNumberPoolRepository(MongoContext context) : ISuiteNumberPoolRepository
{
    public async Task<SuiteNumberPoolEntry?> TryClaimAvailableAsync(
        string regionCode,
        UserId userId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var region = Normalize(regionCode);

        // The whole point of the pool: atomic claim. Mongo's findOneAndUpdate is
        // serializable on a single document, so two callers racing for the last
        // available number in a region will always end up with exactly one win
        // and one null result — no application-level locking required.
        var filter = Builders<SuiteNumberPoolEntryDocument>.Filter.And(
            Builders<SuiteNumberPoolEntryDocument>.Filter.Eq(x => x.RegionCode, region),
            Builders<SuiteNumberPoolEntryDocument>.Filter.Eq(x => x.Status, SuiteNumberPoolStatus.Available));

        var update = Builders<SuiteNumberPoolEntryDocument>.Update
            .Set(x => x.Status, SuiteNumberPoolStatus.Assigned)
            .Set(x => x.AssignedToUserId, userId)
            .Set(x => x.AssignedAtUtc, nowUtc)
            .Set(x => x.ReleasedAtUtc, (DateTime?)null);

        var options = new FindOneAndUpdateOptions<SuiteNumberPoolEntryDocument>
        {
            // Hand out numbers in the order they were minted so ops never sees
            // a "leaky" sequence (00001, 00003, 00002...) — easier to reason
            // about during triage.
            Sort = Builders<SuiteNumberPoolEntryDocument>.Sort.Ascending(x => x.CreatedAtUtc).Ascending(x => x.Number),
            ReturnDocument = ReturnDocument.After,
        };

        var doc = await context.SuiteNumberPool.FindOneAndUpdateAsync(filter, update, options, cancellationToken);
        return doc?.ToDomain();
    }

    public async Task<SuiteNumberPoolEntry?> TryClaimSpecificAsync(
        string regionCode,
        string requestedNumber,
        UserId userId,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var region = Normalize(regionCode);
        var normalizedNumber = requestedNumber.Trim();
        if (string.IsNullOrEmpty(normalizedNumber))
        {
            return null;
        }

        // Insert-with-unique-key is the atomic primitive that gives us the
        // "exactly one user wins this exact number" guarantee. The unique
        // index on Number means a concurrent caller racing for the same hex
        // gets a DuplicateKey write exception while we get the inserted row.
        var entry = SuiteNumberPoolEntry.CreateAlreadyAssigned(region, normalizedNumber, userId, nowUtc);
        try
        {
            await context.SuiteNumberPool.InsertOneAsync(
                SuiteNumberPoolEntryDocument.From(entry),
                cancellationToken: cancellationToken);
            return entry;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            return null;
        }
    }

    public async Task<int> RefillAsync(
        string regionCode,
        IReadOnlyList<string> numbers,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        if (numbers.Count == 0)
        {
            return 0;
        }

        var region = Normalize(regionCode);
        var existing = await FilterExistingNumbersAsync(region, numbers, cancellationToken);

        var docs = numbers
            .Select(n => n.Trim())
            .Where(n => !string.IsNullOrEmpty(n) && !existing.Contains(n))
            .Select(n => SuiteNumberPoolEntryDocument.From(SuiteNumberPoolEntry.CreateAvailable(region, n, nowUtc)))
            .ToList();

        if (docs.Count == 0)
        {
            return 0;
        }

        // OrderedFalse so one accidental dupe (race with a concurrent refill)
        // doesn't abort the whole batch — the unique index on Number is the
        // safety net.
        await context.SuiteNumberPool.InsertManyAsync(
            docs,
            new InsertManyOptions { IsOrdered = false },
            cancellationToken);

        return docs.Count;
    }

    public async Task<bool> EnsureAssignedAsync(
        string regionCode,
        string number,
        UserId userId,
        DateTime assignedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var region = Normalize(regionCode);
        var normalizedNumber = number.Trim();
        if (string.IsNullOrEmpty(normalizedNumber))
        {
            return false;
        }

        var existing = await context.SuiteNumberPool
            .Find(x => x.Number == normalizedNumber)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is not null)
        {
            return false;
        }

        var entry = SuiteNumberPoolEntry.CreateAlreadyAssigned(region, normalizedNumber, userId, assignedAtUtc);
        try
        {
            await context.SuiteNumberPool.InsertOneAsync(
                SuiteNumberPoolEntryDocument.From(entry),
                cancellationToken: cancellationToken);
            return true;
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            // Lost a race with another backfill — treat as "already exists".
            return false;
        }
    }

    public async Task<SuiteNumberPoolEntry?> GetByUserAsync(
        UserId userId,
        CancellationToken cancellationToken = default)
    {
        var doc = await context.SuiteNumberPool
            .Find(x => x.AssignedToUserId == userId && x.Status == SuiteNumberPoolStatus.Assigned)
            .FirstOrDefaultAsync(cancellationToken);
        return doc?.ToDomain();
    }

    public async Task ReleaseAsync(
        SuiteNumberPoolEntryId id,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        var update = Builders<SuiteNumberPoolEntryDocument>.Update
            .Set(x => x.Status, SuiteNumberPoolStatus.Available)
            .Set(x => x.AssignedToUserId, (UserId?)null)
            .Set(x => x.AssignedAtUtc, (DateTime?)null)
            .Set(x => x.ReleasedAtUtc, nowUtc);

        await context.SuiteNumberPool.UpdateOneAsync(
            x => x.Id == id,
            update,
            cancellationToken: cancellationToken);
    }

    public async Task<int> CountAvailableAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var region = Normalize(regionCode);
        var count = await context.SuiteNumberPool.CountDocumentsAsync(
            x => x.RegionCode == region && x.Status == SuiteNumberPoolStatus.Available,
            cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task<int> CountAssignedAsync(
        string regionCode,
        CancellationToken cancellationToken = default)
    {
        var region = Normalize(regionCode);
        var count = await context.SuiteNumberPool.CountDocumentsAsync(
            x => x.RegionCode == region && x.Status == SuiteNumberPoolStatus.Assigned,
            cancellationToken: cancellationToken);
        return (int)count;
    }

    public async Task<IReadOnlySet<string>> FilterExistingNumbersAsync(
        string regionCode,
        IReadOnlyCollection<string> candidateNumbers,
        CancellationToken cancellationToken = default)
    {
        if (candidateNumbers.Count == 0)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        var normalized = candidateNumbers
            .Select(n => n.Trim())
            .Where(n => !string.IsNullOrEmpty(n))
            .ToList();

        var existing = await context.SuiteNumberPool
            .Find(x => normalized.Contains(x.Number))
            .Project(x => x.Number)
            .ToListAsync(cancellationToken);

        return new HashSet<string>(existing, StringComparer.Ordinal);
    }

    private static string Normalize(string regionCode) => regionCode.Trim().ToUpperInvariant();
}
