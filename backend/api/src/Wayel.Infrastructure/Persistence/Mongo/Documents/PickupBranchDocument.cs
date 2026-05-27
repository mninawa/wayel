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
    public string? PoBox { get; set; }
    public string PostalCode { get; set; } = "";
    public string CountryCode { get; set; } = "SZ";
    public string? Phone { get; set; }
    public string? PhoneAlt { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? GooglePlaceId { get; set; }

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
        PoBox = branch.PoBox,
        PostalCode = branch.PostalCode,
        CountryCode = branch.CountryCode,
        Phone = branch.Phone,
        PhoneAlt = branch.PhoneAlt,
        Latitude = branch.Latitude,
        Longitude = branch.Longitude,
        GooglePlaceId = branch.GooglePlaceId,
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
            SortOrder,
            PoBox,
            PostalCode,
            CountryCode,
            Phone,
            PhoneAlt,
            Latitude,
            Longitude,
            GooglePlaceId);
}
