using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace Wayel.Bff.Shared.Sessions;

/// <summary>
/// <see cref="IXmlRepository"/> backed by a MongoDB collection. Persists
/// the ASP.NET Data Protection key ring across container restarts so the
/// cookie ciphertext we mint before a deploy stays decryptable after the
/// deploy — without this, every release silently logs every user out.
/// </summary>
/// <remarks>
/// One row per generated key (insert-only); ASP.NET disambiguates the rows
/// it cares about via the per-app <c>SetApplicationName</c> discriminator
/// embedded in each key's XML, so the three BFFs (admin / external / any
/// future audience) can safely share one collection.
/// </remarks>
internal sealed class MongoXmlRepository : IXmlRepository
{
    private readonly IMongoCollection<DataProtectionKeyDocument> _collection;

    public MongoXmlRepository(IMongoCollection<DataProtectionKeyDocument> collection)
    {
        _collection = collection;
    }

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        // Read-all is the contract: ASP.NET filters by application name in
        // memory after this returns. The collection is microscopic (one
        // doc per key, keys rotate every ~90 days), so a full scan is
        // fine and avoids the operational overhead of an index.
        var docs = _collection
            .Find(FilterDefinition<DataProtectionKeyDocument>.Empty)
            .ToList();

        var elements = new List<XElement>(docs.Count);
        foreach (var doc in docs)
        {
            if (string.IsNullOrEmpty(doc.Xml))
            {
                continue;
            }

            try
            {
                elements.Add(XElement.Parse(doc.Xml));
            }
            catch (System.Xml.XmlException)
            {
                // A corrupt row should never happen, but if it does we
                // skip it rather than crash the entire host on startup.
                // ASP.NET will mint a fresh key on next rotation.
            }
        }

        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        // ASP.NET only calls StoreElement when CREATING a new key (or
        // when stamping a revocation), so a plain insert is correct —
        // the framework's FileSystemXmlRepository likewise just writes
        // a new file each time.
        _collection.InsertOne(new DataProtectionKeyDocument
        {
            Id = ObjectId.GenerateNewId(),
            FriendlyName = friendlyName ?? string.Empty,
            Xml = element.ToString(SaveOptions.DisableFormatting),
            CreatedOnUtc = DateTime.UtcNow,
        });
    }
}

/// <summary>BSON shape for one Data Protection key blob.</summary>
internal sealed class DataProtectionKeyDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("friendly_name")]
    public string FriendlyName { get; set; } = string.Empty;

    [BsonElement("xml")]
    public string Xml { get; set; } = string.Empty;

    [BsonElement("created_on_utc")]
    public DateTime CreatedOnUtc { get; set; }
}

/// <summary>
/// Extension wiring a <see cref="MongoXmlRepository"/> behind ASP.NET
/// Core's Data Protection key ring. Mirrors the official
/// <c>PersistKeysToFileSystem</c> helper — same shape, different store.
/// </summary>
public static class MongoDataProtectionExtensions
{
    /// <summary>
    /// Persist the Data Protection key ring to MongoDB. Safe to call
    /// once per host; the underlying <see cref="MongoClient"/> is built
    /// once and reused via the singleton <see cref="KeyManagementOptions"/>.
    /// </summary>
    public static IDataProtectionBuilder PersistKeysToMongo(
        this IDataProtectionBuilder builder,
        string connectionString,
        string databaseName,
        string collectionName = "data_protection_keys")
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new ArgumentException(
                "Mongo connection string is required.",
                nameof(connectionString));
        }

        if (string.IsNullOrWhiteSpace(databaseName))
        {
            throw new ArgumentException(
                "Mongo database name is required.",
                nameof(databaseName));
        }

        var client = new MongoClient(connectionString);
        var collection = client
            .GetDatabase(databaseName)
            .GetCollection<DataProtectionKeyDocument>(collectionName);

        builder.Services.Configure<KeyManagementOptions>(opts =>
        {
            opts.XmlRepository = new MongoXmlRepository(collection);
        });

        return builder;
    }
}
