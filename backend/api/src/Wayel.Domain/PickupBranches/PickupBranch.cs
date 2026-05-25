namespace Wayel.Domain.PickupBranches;

/// <summary>WeYell Eswatini pickup branch (configured in MongoDB; admin UI later).</summary>
public sealed class PickupBranch
{
    private PickupBranch(
        string id,
        string name,
        string line1,
        string? line2,
        string city,
        string region,
        string description,
        bool isActive,
        int sortOrder)
    {
        Id = id;
        Name = name;
        Line1 = line1;
        Line2 = line2;
        City = city;
        Region = region;
        Description = description;
        IsActive = isActive;
        SortOrder = sortOrder;
    }

    public string Id { get; }
    public string Name { get; }
    public string Line1 { get; }
    public string? Line2 { get; }
    public string City { get; }
    public string Region { get; }
    public string Description { get; }
    public bool IsActive { get; }
    public int SortOrder { get; }

    public static PickupBranch Create(
        string id,
        string name,
        string line1,
        string? line2,
        string city,
        string region,
        string description,
        int sortOrder = 0) =>
        new(
            id.Trim().ToLowerInvariant(),
            name.Trim(),
            line1.Trim(),
            string.IsNullOrWhiteSpace(line2) ? null : line2.Trim(),
            city.Trim(),
            region.Trim(),
            description.Trim(),
            isActive: true,
            sortOrder);

    public static PickupBranch Rehydrate(
        string id,
        string name,
        string line1,
        string? line2,
        string city,
        string region,
        string description,
        bool isActive,
        int sortOrder) =>
        new(id, name, line1, line2, city, region, description, isActive, sortOrder);
}
