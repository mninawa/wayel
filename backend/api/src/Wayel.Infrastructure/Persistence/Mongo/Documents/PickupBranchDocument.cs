using Wayel.Domain.PickupBranches;

namespace Wayel.Infrastructure.Persistence.Mongo.Documents;

internal sealed class PickupBranchDocument
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Line1 { get; set; } = "";
    public string? Line2 { get; set; }
    public string City { get; set; } = "";
    public string Region { get; set; } = "";
    public string Description { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }

    public static PickupBranchDocument From(PickupBranch branch) => new()
    {
        Id = branch.Id,
        Name = branch.Name,
        Line1 = branch.Line1,
        Line2 = branch.Line2,
        City = branch.City,
        Region = branch.Region,
        Description = branch.Description,
        IsActive = branch.IsActive,
        SortOrder = branch.SortOrder,
    };

    public PickupBranch ToDomain() =>
        PickupBranch.Rehydrate(
            Id,
            Name,
            Line1,
            Line2,
            City,
            Region,
            Description,
            IsActive,
            SortOrder);
}
