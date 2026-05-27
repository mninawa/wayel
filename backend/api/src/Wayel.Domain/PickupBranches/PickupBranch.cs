namespace Wayel.Domain.PickupBranches;

/// <summary>WeYell pickup branch (configured in MongoDB; admin UI later).</summary>
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
        int sortOrder,
        string? poBox,
        string postalCode,
        string countryCode,
        string? phone,
        string? phoneAlt,
        double? latitude,
        double? longitude,
        string? googlePlaceId)
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
        PoBox = poBox;
        PostalCode = postalCode;
        CountryCode = countryCode;
        Phone = phone;
        PhoneAlt = phoneAlt;
        Latitude = latitude;
        Longitude = longitude;
        GooglePlaceId = googlePlaceId;
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
    public string? PoBox { get; }
    public string PostalCode { get; }
    public string CountryCode { get; }
    public string? Phone { get; }
    public string? PhoneAlt { get; }
    public double? Latitude { get; }
    public double? Longitude { get; }
    public string? GooglePlaceId { get; }

    public static PickupBranch Create(
        string id,
        string name,
        string line1,
        string? line2,
        string city,
        string region,
        string description,
        int sortOrder = 0,
        string? poBox = null,
        string postalCode = "",
        string countryCode = "SZ",
        string? phone = null,
        string? phoneAlt = null,
        double? latitude = null,
        double? longitude = null,
        string? googlePlaceId = null) =>
        new(
            id.Trim().ToLowerInvariant(),
            name.Trim(),
            line1.Trim(),
            string.IsNullOrWhiteSpace(line2) ? null : line2.Trim(),
            city.Trim(),
            region.Trim(),
            description.Trim(),
            isActive: true,
            sortOrder,
            string.IsNullOrWhiteSpace(poBox) ? null : poBox.Trim(),
            postalCode.Trim(),
            countryCode.Trim().ToUpperInvariant(),
            string.IsNullOrWhiteSpace(phone) ? null : phone.Trim(),
            string.IsNullOrWhiteSpace(phoneAlt) ? null : phoneAlt.Trim(),
            latitude,
            longitude,
            string.IsNullOrWhiteSpace(googlePlaceId) ? null : googlePlaceId.Trim());

    public static PickupBranch Rehydrate(
        string id,
        string name,
        string line1,
        string? line2,
        string city,
        string region,
        string description,
        bool isActive,
        int sortOrder,
        string? poBox = null,
        string postalCode = "",
        string countryCode = "SZ",
        string? phone = null,
        string? phoneAlt = null,
        double? latitude = null,
        double? longitude = null,
        string? googlePlaceId = null) =>
        new(
            id,
            name,
            line1,
            line2,
            city,
            region,
            description,
            isActive,
            sortOrder,
            poBox,
            postalCode,
            countryCode,
            phone,
            phoneAlt,
            latitude,
            longitude,
            googlePlaceId);
}
