using Wayel.Domain.Parcels;

namespace Wayel.Application.Features.Parcels;

internal static class TestParcelCatalogs
{
    internal sealed record Template(
        string Retailer,
        string Tracking,
        string Item,
        string Category,
        decimal Value,
        string Dims,
        decimal WeightKg,
        ParcelStatus Status,
        bool WithInvoice);

    public const string CatalogA = "catalog-a";
    public const string CatalogB = "catalog-b";

    private static readonly Template[] CatalogATemplates =
    [
        new("Takealot", "BRC100012345ZA", "Sony WH-1000XM5", "Headphones", 2899m, "30x22x15", 2.1m, ParcelStatus.ReadyToShip, true),
        new("Superbalist", "BRC100012346ZA", "Nike Air Max Excee", "Men's Shoes", 1650m, "35x25x12", 2.0m, ParcelStatus.ReadyToShip, true),
        new("Makro", "BRC100012347ZA", "Samsung Galaxy Buds2", "Electronics", 1299m, "12x10x8", 1.8m, ParcelStatus.ReadyToShip, true),
        new("Woolworths", "BRC100012348ZA", "Linen Shirt Bundle", "Clothing", 890m, "28x20x6", 2.2m, ParcelStatus.Received, true),
        new("Zando", "BRC100012349ZA", "Levi's 501 Jeans", "Clothing", 749m, "32x24x8", 2.0m, ParcelStatus.ReadyToShip, true),
        new("Dis-Chem", "BRC100012350ZA", "Skincare Gift Set", "Health & Beauty", 520m, "22x18x10", 2.3m, ParcelStatus.Received, true),
    ];

    private static readonly Template[] CatalogBTemplates =
    [
        new("Amazon.co.za", "BRC200012351ZA", "Kindle Paperwhite (16 GB)", "Electronics", 2499m, "16x12x4", 1.4m, ParcelStatus.ReadyToShip, true),
        new("Incredible Connection", "BRC200012352ZA", "Logitech MX Keys Mini", "Electronics", 1899m, "30x14x5", 1.6m, ParcelStatus.ReadyToShip, true),
        new("Builders Warehouse", "BRC200012353ZA", "Bosch Cordless Drill Kit", "Tools", 2199m, "38x28x14", 3.2m, ParcelStatus.ReadyToShip, true),
        new("Cape Union Mart", "BRC200012354ZA", "Osprey Daypack 26L", "Outdoor", 1450m, "45x30x18", 2.8m, ParcelStatus.ReadyToShip, true),
        new("Sportsmans Warehouse", "BRC200012355ZA", "Garmin Forerunner 55", "Sports", 2799m, "18x14x8", 1.9m, ParcelStatus.ReadyToShip, true),
        new("Poetry", "BRC200012356ZA", "Desk Organiser Set", "Home & Office", 420m, "40x25x12", 2.5m, ParcelStatus.ReadyToShip, true),
    ];

    public static bool TryGetTemplates(string? dataset, out IReadOnlyList<Template> templates, out string displayName)
    {
        var key = NormalizeDataset(dataset);
        switch (key)
        {
            case CatalogB:
                templates = CatalogBTemplates;
                displayName = "Catalog B (electronics & outdoor)";
                return true;
            case CatalogA:
                templates = CatalogATemplates;
                displayName = "Catalog A (fashion & beauty)";
                return true;
            default:
                templates = Array.Empty<Template>();
                displayName = string.Empty;
                return false;
        }
    }

    public static string NormalizeDataset(string? dataset)
    {
        if (string.IsNullOrWhiteSpace(dataset))
        {
            return CatalogA;
        }

        var trimmed = dataset.Trim().ToLowerInvariant();
        return trimmed switch
        {
            "catalog-a" or "cataloga" or "a" or "default" => CatalogA,
            "catalog-b" or "catalogb" or "b" or "alt" or "alternate" => CatalogB,
            _ => trimmed,
        };
    }
}
