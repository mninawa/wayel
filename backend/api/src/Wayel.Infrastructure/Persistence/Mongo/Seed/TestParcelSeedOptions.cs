namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

public sealed class TestParcelSeedOptions
{
    public const string SectionName = "Seed:TestParcels";

    /// <summary>
    /// Opt-in for Production. Development hosts enable the dev parcel endpoint
    /// even when this is false. Set <c>Seed__TestParcels__Enabled=true</c> on staging.
    /// </summary>
    public bool Enabled { get; set; }
}
