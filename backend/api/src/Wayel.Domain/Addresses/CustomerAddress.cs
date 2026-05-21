using Wayel.Domain.Common;
using Wayel.Domain.Users;

namespace Wayel.Domain.Addresses;

public sealed class CustomerAddress : AggregateRoot<CustomerAddressId>
{
    private CustomerAddress(
        CustomerAddressId id,
        UserId userId,
        string type,
        string line1,
        string? line2,
        string city,
        string province,
        string country,
        string postalCode,
        bool isSuiteAddress,
        string label,
        string recipientName,
        string? phone,
        bool isDefault)
        : base(id)
    {
        UserId = userId;
        Type = type;
        Line1 = line1;
        Line2 = line2;
        City = city;
        Province = province;
        Country = country;
        PostalCode = postalCode;
        IsSuiteAddress = isSuiteAddress;
        Label = label;
        RecipientName = recipientName;
        Phone = phone;
        IsDefault = isDefault;
    }

    public UserId UserId { get; }
    public string Type { get; }
    public string Line1 { get; private set; }
    public string? Line2 { get; private set; }
    public string City { get; private set; }
    public string Province { get; private set; }
    public string Country { get; }
    public string PostalCode { get; }
    public bool IsSuiteAddress { get; }
    public string Label { get; private set; }
    public string RecipientName { get; private set; }
    public string? Phone { get; private set; }
    public bool IsDefault { get; private set; }

    public static CustomerAddress CreateSuite(UserId userId, string suiteNumber, string warehouseLine) =>
        new(
            CustomerAddressId.New(),
            userId,
            "suite",
            warehouseLine,
            null,
            "Johannesburg",
            "Gauteng",
            "ZA",
            "2000",
            true,
            "SA Suite",
            string.Empty,
            null,
            false)
        { SuiteNumber = suiteNumber };

    public static CustomerAddress CreateDelivery(
        UserId userId,
        string label,
        string recipientName,
        string phone,
        string line1,
        string? line2,
        string city,
        string region,
        string countryCode,
        bool isDefault) =>
        new(
            CustomerAddressId.New(),
            userId,
            "delivery",
            line1,
            line2,
            city,
            region,
            countryCode,
            string.Empty,
            false,
            label.Trim(),
            recipientName.Trim(),
            phone.Trim(),
            isDefault);

    public string SuiteNumber { get; private set; } = string.Empty;

    public void UpdateDelivery(
        string label,
        string recipientName,
        string phone,
        string line1,
        string? line2,
        string city,
        string region,
        bool isDefault)
    {
        if (IsSuiteAddress)
        {
            throw new InvalidOperationException("Cannot update a suite address as delivery.");
        }

        Label = label.Trim();
        RecipientName = recipientName.Trim();
        Phone = phone.Trim();
        Line1 = line1.Trim();
        Line2 = string.IsNullOrWhiteSpace(line2) ? null : line2.Trim();
        City = city.Trim();
        Province = region.Trim();
        IsDefault = isDefault;
    }

    public void SetDefault(bool isDefault) => IsDefault = isDefault;

    public static CustomerAddress Rehydrate(
        CustomerAddressId id,
        UserId userId,
        string type,
        string line1,
        string? line2,
        string city,
        string province,
        string country,
        string postalCode,
        bool isSuiteAddress,
        string suiteNumber,
        string label = "",
        string recipientName = "",
        string? phone = null,
        bool isDefault = false) =>
        new(id, userId, type, line1, line2, city, province, country, postalCode, isSuiteAddress, label, recipientName, phone, isDefault)
        { SuiteNumber = suiteNumber };
}
