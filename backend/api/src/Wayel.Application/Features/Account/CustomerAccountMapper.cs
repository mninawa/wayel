using Wayel.Application.BorderBox;
using Wayel.Domain.Addresses;
using Wayel.Domain.PickupBranches;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

internal static class CustomerAccountMapper
{
    public static CustomerAccountResponse Map(
        User user,
        CustomerAddress? suiteAddress,
        IReadOnlyList<CustomerAddress> allAddresses,
        bool hasGoogleIdentity,
        IReadOnlyList<PickupBranch> pickupBranches,
        string? suiteWarehouseName = null)
    {
        var profileComplete = CustomerProfileRules.IsComplete(user);
        var hasSuite = suiteAddress is not null && !string.IsNullOrWhiteSpace(suiteAddress.SuiteNumber);
        var branchNames = pickupBranches.ToDictionary(b => b.Id, b => b.Name, StringComparer.Ordinal);

        return new CustomerAccountResponse(
            MapProfile(user, hasGoogleIdentity),
            suiteAddress is null ? null : MapSuite(user, suiteAddress, suiteWarehouseName),
            allAddresses
                .Where(a => !a.IsSuiteAddress)
                .Select(a => MapDelivery(a, branchNames))
                .ToList(),
            new NotificationPreferencesDto(
                user.NotifyEmail,
                user.NotifySms,
                user.NotifyWhatsApp,
                user.NotifyMarketing),
            profileComplete,
            profileComplete && !hasSuite,
            hasSuite);
    }

    private static CustomerProfileDto MapProfile(User user, bool hasGoogleIdentity) =>
        new(
            user.Id.Value.ToString(),
            user.Email.Value,
            user.FirstName,
            user.LastName,
            user.DisplayName,
            user.Phone ?? string.Empty,
            user.DestinationCountry,
            CountryLabel(user.DestinationCountry),
            user.IdNumber,
            string.IsNullOrWhiteSpace(user.IdDocumentType) ? "NationalId" : user.IdDocumentType,
            string.IsNullOrWhiteSpace(user.PreferredDeliveryMethod) ? "PUDO" : user.PreferredDeliveryMethod,
            user.KycStatus.ToString(),
            user.KycRejectionReason,
            user.CreatedOnUtc.ToString("o"),
            hasGoogleIdentity && !user.HasPasswordCredential ? "google" : "password");

    private static SuiteAddressDto MapSuite(User user, CustomerAddress suite, string? warehouseName) =>
        new(
            suite.SuiteNumber,
            "SA Suite Address",
            user.DisplayName,
            string.IsNullOrWhiteSpace(warehouseName) ? "WeYell Sandton Warehouse" : warehouseName,
            suite.Line1,
            suite.Line2,
            suite.City,
            suite.Province,
            suite.PostalCode,
            "South Africa",
            suite.Country,
            FormatSuite(suite, user.DisplayName, suite.SuiteNumber));

    private static DeliveryAddressDto MapDelivery(
        CustomerAddress address,
        IReadOnlyDictionary<string, string> branchNames) =>
        new(
            address.Id.Value.ToString(),
            address.PickupBranchId,
            branchNames.GetValueOrDefault(address.PickupBranchId) ?? string.Empty,
            address.Label,
            address.RecipientName,
            address.Phone ?? string.Empty,
            address.Line1,
            address.Line2,
            address.City,
            address.Province,
            address.Country,
            CountryLabel(address.Country),
            address.IsDefault);

    private static string FormatSuite(CustomerAddress suite, string recipient, string suiteNumber)
    {
        var street = string.IsNullOrWhiteSpace(suite.Line2)
            ? suite.Line1
            : $"{suite.Line1.Trim()}, {suite.Line2.Trim()}";

        return string.Join(
            "\n",
            new[]
            {
                recipient,
                $"Suite {suiteNumber}",
                street,
                $"{suite.City}, {suite.Province} {suite.PostalCode}",
                "South Africa",
            }.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string CountryLabel(string code) =>
        code.ToUpperInvariant() switch
        {
            "SZ" => "Eswatini",
            "BW" => "Botswana",
            "NA" => "Namibia",
            "ZA" => "South Africa",
            _ => code,
        };

    internal static string DestinationCountryLabel(string code) => CountryLabel(code);
}
