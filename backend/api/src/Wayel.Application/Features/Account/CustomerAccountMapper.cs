using Wayel.Application.BorderBox;
using Wayel.Domain.Addresses;
using Wayel.Domain.Users;

namespace Wayel.Application.Features.Account;

internal static class CustomerAccountMapper
{
    public static CustomerAccountResponse Map(
        User user,
        CustomerAddress? suiteAddress,
        IReadOnlyList<CustomerAddress> allAddresses,
        bool hasGoogleIdentity)
    {
        var profileComplete = CustomerProfileRules.IsComplete(user);
        var hasSuite = suiteAddress is not null && !string.IsNullOrWhiteSpace(suiteAddress.SuiteNumber);

        return new CustomerAccountResponse(
            MapProfile(user, hasGoogleIdentity),
            suiteAddress is null ? null : MapSuite(user, suiteAddress),
            allAddresses
                .Where(a => !a.IsSuiteAddress)
                .Select(MapDelivery)
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
            string.IsNullOrWhiteSpace(user.PreferredDeliveryMethod) ? "Door-to-Door" : user.PreferredDeliveryMethod,
            user.KycStatus.ToString(),
            user.CreatedOnUtc.ToString("o"),
            hasGoogleIdentity && !user.HasPasswordCredential ? "google" : "password");

    private static SuiteAddressDto MapSuite(User user, CustomerAddress suite) =>
        new(
            suite.SuiteNumber,
            "SA Suite Address",
            user.DisplayName,
            "WeYell Johannesburg Warehouse",
            suite.Line1,
            suite.Line2,
            suite.City,
            suite.Province,
            suite.PostalCode,
            "South Africa",
            suite.Country,
            FormatSuite(suite, user.DisplayName, suite.SuiteNumber));

    private static DeliveryAddressDto MapDelivery(CustomerAddress address) =>
        new(
            address.Id.Value.ToString(),
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

    private static string FormatSuite(CustomerAddress suite, string recipient, string suiteNumber) =>
        string.Join(
            "\n",
            new[]
            {
                recipient,
                $"Suite {suiteNumber}",
                suite.Line1,
                $"{suite.City}, {suite.Province} {suite.PostalCode}",
                "South Africa",
            }.Where(x => !string.IsNullOrWhiteSpace(x)));

    private static string CountryLabel(string code) =>
        code.ToUpperInvariant() switch
        {
            "SZ" => "Eswatini",
            "ZA" => "South Africa",
            _ => code,
        };
}
