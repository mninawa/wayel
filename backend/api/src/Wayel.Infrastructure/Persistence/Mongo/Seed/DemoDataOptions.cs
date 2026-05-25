namespace Wayel.Infrastructure.Persistence.Mongo.Seed;

public sealed class DemoDataOptions
{
    public const string SectionName = "Seed:DemoData";

    public bool Enabled { get; init; } = true;

    /// <summary>Password applied to all password-based demo personas (not Google-only).</summary>
    public string DemoPassword { get; init; } = "demo1234";

    /// <summary>Legacy config key; seeding uses fixed persona emails (see docs/DOCKER.md).</summary>
    public string DemoEmail { get; init; } = "sabelo@weyell.demo";

    public string SuiteNumber { get; init; } = "24789";
}
