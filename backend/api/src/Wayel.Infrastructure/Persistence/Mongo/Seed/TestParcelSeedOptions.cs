namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

public sealed class TestParcelSeedOptions
{
    public const string SectionName = "Seed:TestParcels";

    /// <summary>
    /// When true, exposes POST /borderbox/dev/seed-shippable-parcels for the signed-in customer.
    /// </summary>
    public bool Enabled { get; set; }
}
