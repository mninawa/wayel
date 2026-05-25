namespace Wayel.Application.Features.SuitePlatform;

/// <summary>
/// Canonical mailing + tracking address for the WeYell consolidation hub.
///
/// This is the single source of truth that customer-facing surfaces should
/// read from when they need to render "where the parcel is right now" on
/// the South African side of the journey:
///
///   * Shipment tracking detail page (origin chip + history events).
///   * Quote detail page (where the goods will land in SA).
///   * Suite mailing label rendered on the customer dashboard.
///   * Outbound notifications (email + WhatsApp).
///
/// <see cref="SuitePlatformSettings.ForRegion(string)"/> overlays these
/// constants onto the per-destination defaults that are persisted in
/// Mongo, so an operator who edits the warehouse via the ops dashboard
/// rebases on these values for any new region they spin up but can also
/// override them per-region if a destination ever moves to a separate
/// hub.
///
/// When the hub moves: edit the constants below + redeploy. A startup
/// migrator (`LegacyOriginRebrandMigrator`) rewrites historical tracking
/// rows that still reference the previous location so customer-facing
/// shipment timelines flip in lockstep.
/// </summary>
public static class WeYellHubAddress
{
    public const string WarehouseName = "WeYell Sandton Warehouse";

    public const string AddressLine1 = "2 meerlust place, hurlingham manor";
    public const string? AddressLine2 = null;

    public const string City = "Sandton";
    public const string Province = "Gauteng";
    public const string PostalCode = "2192";

    /// <summary>ISO 3166-1 alpha-2 country code (e.g. "ZA").</summary>
    public const string CountryCode = "ZA";

    /// <summary>Human-readable country name used in tracking labels.</summary>
    public const string Country = "South Africa";

    /// <summary>"Sandton, South Africa" — short origin label used in
    /// shipment summary cards and tracking history rows.</summary>
    public const string CityCountry = $"{City}, {Country}";

    /// <summary>"Sandton, Gauteng, South Africa" — full origin label used
    /// in the shipment-summary "from" chip on the customer detail page.</summary>
    public const string CityProvinceCountry = $"{City}, {Province}, {Country}";

    /// <summary>"Sandton, Gauteng" — compact label used in the quote detail
    /// "Origin" column.</summary>
    public const string CityProvince = $"{City}, {Province}";
}
